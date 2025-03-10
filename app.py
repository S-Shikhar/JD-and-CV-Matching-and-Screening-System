from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from typing import List
import uuid
from db import get_db  # type: ignore
from datetime import datetime
from auth import add_auth_routes, get_current_user
from helpers import extract_text_from_file, get_llm_response, parse_llm_response, check_rate_limit_demo, get_client_identifier, MAX_REQUESTS, MAX_REQUESTS_FREE, check_rate_limit_free_users
from dotenv import load_dotenv

load_dotenv()

# Initialize FastAPI app
app = FastAPI()

# Add CORS middleware to allow requests from your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


# Adding auth routes
add_auth_routes(app)

# API Routes


@app.post("/api/employee", response_class=JSONResponse)
async def process_employee(
    file: UploadFile = File(...),
    jd_text: str = Form(None),
    jd_file: UploadFile = File(None),
    current_user: dict = Depends(get_current_user),
    remaining_requests: int = Depends(check_rate_limit_free_users) 
):
    """API endpoint for CV evaluation based on the given JD."""
    # Validate inputs
    if not jd_text and not jd_file:
        raise HTTPException(
            status_code=400,
            detail="No JD provided. Please provide JD text or JD file."
        )

    if not file:
        raise HTTPException(
            status_code=400,
            detail="No CV Provided. Please upload CV file (Docx or PDF)."
        )

    try:
        # Get database connection
        db = get_db()

        # Extract text from uploaded CV
        cv_text = extract_text_from_file(file)

        # Extract text from JD file if provided
        jd_text_final = jd_text
        if not jd_text and jd_file:
            jd_text_final = extract_text_from_file(jd_file)

        # Construct LLM prompt
        prompt = f"""
You are an expert HR consultant with extensive experience evaluating resumes in both technical (e.g., software engineering, data science) and non-technical (e.g., accounting, business analysis) domains. Please analyze the following candidate's CV and job description (JD) and complete these tasks:

1. Compare the CV with the JD and determine how well the candidate meets the job requirements.
2. Calculate a matching score as a percentage (0 to 100), where 100 means a perfect match.
3. Identify any missing skills or areas for improvement, and list them as an array of concise strings.
4. Provide a concise profile summary in no more than 30 words.
5. Return your answer strictly as a valid JSON object with exactly these keys:
   - "JD-Match": a number (the match percentage; use 0 if no match).
   - "Missing Skills": an array of strings (empty array if none).
   - "Profile Summary": a string (maximum 30 words summarizing strengths and overall profile).

Here is the information to analyze:

CV:
{cv_text}

JD:
{jd_text_final}
"""

        # Generate LLM response
        llm_response = get_llm_response(prompt)
        parsed_llm_response = parse_llm_response(llm_response)

        # Store data in MongoDB
        record = {
            "employer_id": str(uuid.uuid4()),
            "cv_filename": file.filename,
            "jd_filename": jd_file.filename if jd_file else None,
            "jd_text": jd_text_final,
            "cv_text": cv_text,
            "analysis_result": parsed_llm_response,
            "user_id": str(current_user.get("_id", "")),
            "created_at": datetime.now()
        }

        try:
            await db.employee_uploads.insert_one(record)
        except Exception as e:
            # Log the database error but continue to return the analysis
            print(f"Database error: {str(e)}")
            
        # Add rate limit information to response
        response_content = parsed_llm_response.copy()
        response_content["rate_limit"] = {
            "remaining_requests": remaining_requests,
            "max_requests": MAX_REQUESTS_FREE,
            "reset_after_hours": 24
        }

        return JSONResponse(
            status_code=200,
            content=response_content
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing request: {str(e)}"
        )


@app.post("/api/employer", response_class=JSONResponse)
async def process_employer(
    jd_text: str = Form(None),
    jd_file: UploadFile = File(None),
    candidates: List[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
    remaining_requests: int = Depends(check_rate_limit_free_users)
):
    """API endpoint for evaluating multiple CVs against a JD."""
    # Validate inputs
    if not jd_text and not jd_file:
        raise HTTPException(
            status_code=400,
            detail="No JD provided. Please provide JD text or JD file."
        )

    if not candidates or len(candidates) == 0:
        raise HTTPException(
            status_code=400,
            detail="No candidate CVs provided."
        )

    try:
        # Get database connection
        db = get_db()

        # Extract JD text
        jd_text_final = jd_text
        if not jd_text and jd_file:
            jd_text_final = extract_text_from_file(jd_file)

        # Process candidates
        candidate_results = []
        employer_id = str(uuid.uuid4())  # Same employer ID for all candidates

        for cv_file in candidates:
            try:
                # Extract CV text
                cv_text = extract_text_from_file(cv_file)

                # Construct LLM prompt
                prompt = f"""
You are an expert HR consultant with extensive experience evaluating resumes in both technical (e.g., software engineering, data science) and non-technical (e.g., accounting, business analysis) domains. Please analyze the following candidate's CV and job description (JD) and complete these tasks:

1. Compare the CV with the JD and determine how well the candidate meets the job requirements.
2. Calculate a matching score as a percentage (0 to 100), where 100 means a perfect match.
3. Identify any missing skills or areas for improvement, and list them as an array of concise strings.
4. Provide a concise profile summary in no more than 30 words.
5. Return your answer strictly as a valid JSON object with exactly these keys:
   - "JD-Match": a number (the match percentage; use 0 if no match).
   - "Missing Skills": an array of strings (empty array if none).
   - "Profile Summary": a string (maximum 30 words summarizing strengths and overall profile).

Here is the information to analyze:

CV:
{cv_text}

JD:
{jd_text_final}
"""

                # Generate LLM response
                llm_response = get_llm_response(prompt)
                parsed_response = parse_llm_response(llm_response)

                # Add to results
                candidate_result = {
                    "filename": cv_file.filename,
                    **parsed_response
                }
                candidate_results.append(candidate_result)

                # Store in MongoDB
                record = {
                    "employer_id": employer_id,
                    "cv_filename": cv_file.filename,
                    "jd_text": jd_text_final,
                    "cv_text": cv_text,
                    "analysis_result": parsed_response,
                    "user_id": str(current_user.get("_id", "")),
                    "created_at": datetime.now()
                }

                try:
                    await db.employer_uploads.insert_one(record)
                except Exception as e:
                    # Log the database error but continue processing
                    print(f"Database error for {cv_file.filename}: {str(e)}")

            except Exception as e:
                # Log the error but continue with other candidates
                print(f"Error processing {cv_file.filename}: {str(e)}")
                continue

        # Sort candidates by match score
        candidate_results.sort(
            key=lambda x: (-x["JD-Match"], len(x["Missing Skills"]))
        )

        # Assign positions
        for index, result in enumerate(candidate_results):
            result["Position"] = index + 1

        return JSONResponse(
            status_code=200,
            content={
                "employer_id": employer_id,
                "candidates_count": len(candidate_results),
                "candidates_results": candidate_results,
                "remaining_requests": remaining_requests,
                "maximum_requests": MAX_REQUESTS_FREE,
                "reset_after_hours": 24
            }
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing request: {str(e)}"
        )


@app.post("/api/demo", response_class=JSONResponse)
async def demo(
    file: UploadFile = File(...),
    jd_file: UploadFile = File(None),
    remaining_requests: int = Depends(check_rate_limit_demo)
):
    """Demo API for JD-CV matching with rate limiting"""
    # validation of uploaded files
    if not jd_file:
        raise HTTPException(
            status_code=400,
            detail="No JD Provided. Please upload JD file (Docx or PDF)."
        )
    if not file:
        raise HTTPException(
            status_code=400,
            detail="No CV Provided. Please upload CV file (Docx or PDF)."
        )

    try:
        # Extract text from uploaded CV
        cv_text = extract_text_from_file(file)

        # Extract text from JD file

        jd_text_final = extract_text_from_file(jd_file)

        # Construct LLM prompt
        prompt = f"""
You are an expert HR consultant with extensive experience evaluating resumes in both technical (e.g., software engineering, data science) and non-technical (e.g., accounting, business analysis) domains. Please analyze the following candidate's CV and job description (JD) and complete these tasks:

1. Compare the CV with the JD and determine how well the candidate meets the job requirements.
2. Calculate a matching score as a percentage (0 to 100), where 100 means a perfect match.
3. Identify any missing skills or areas for improvement, and list them as an array of concise strings.
4. Provide a concise profile summary in no more than 30 words.
5. Return your answer strictly as a valid JSON object with exactly these keys:
   - "JD-Match": a number (the match percentage; use 0 if no match).
   - "Missing Skills": an array of strings (empty array if none).
   - "Profile Summary": a string (maximum 30 words summarizing strengths and overall profile).

Here is the information to analyze:

CV:
{cv_text}

JD:
{jd_text_final}
"""

        # Generate LLM response
        llm_response = get_llm_response(prompt)
        parsed_llm_response = parse_llm_response(llm_response)

        # Add rate limit information to response
        response_content = parsed_llm_response.copy()
        response_content["rate_limit"] = {
            "remaining_requests": remaining_requests,
            "max_requests": MAX_REQUESTS,
            "reset_after_hours": 24
        }

        return JSONResponse(
            status_code=200,
            content=response_content
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing request: {str(e)}"
        )


# Profile API endpoints

@app.get("/api/profile", response_class=JSONResponse)
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    """
    Get the profile details of the currently authenticated user (employee or employer).
    Returns different fields based on the user type.
    """
    try:
        # Get the user type and create a sanitized response
        user_type = current_user.get("user_type")

        if user_type == "employee":
            return JSONResponse(
                status_code=200,
                content={
                    "user_id": str(current_user.get("_id", "")),
                    "full_name": current_user.get("full_name", ""),
                    "email": current_user.get("email", ""),
                    "user_type": "employee",
                    "created_at": current_user.get("created_at", "").isoformat() if isinstance(current_user.get("created_at"), datetime) else str(current_user.get("created_at", "")),
                    "is_active": current_user.get("is_active", True)
                }
            )
        elif user_type == "employer":
            return JSONResponse(
                status_code=200,
                content={
                    "user_id": str(current_user.get("_id", "")),
                    "company_name": current_user.get("company_name", ""),
                    "email": current_user.get("email", ""),
                    "user_type": "employer",
                    "created_at": current_user.get("created_at", "").isoformat() if isinstance(current_user.get("created_at"), datetime) else str(current_user.get("created_at", "")),
                    "is_active": current_user.get("is_active", True)
                }
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid user type")

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error retrieving profile: {str(e)}")


@app.get("/api/profile/history", response_class=JSONResponse)
async def get_user_history(current_user: dict = Depends(get_current_user)):
    """
    Get the upload history for the currently authenticated user.
    Returns different collections based on user type.
    """
    try:
        db = get_db()
        user_type = current_user.get("user_type")
        user_id = str(current_user.get("_id", ""))

        if user_type == "employee":
            # Get employee's CV upload history
            uploads = await db.employee_uploads.find(
                {"user_id": user_id}
            ).sort("created_at", -1).to_list(length=20)

            # Convert ObjectId to string for JSON serialization
            formatted_uploads = []
            for upload in uploads:
                formatted_uploads.append({
                    "_id": str(upload["_id"]),
                    "cv_filename": upload.get("cv_filename", ""),
                    "jd_text": upload.get("jd_text", "")[:100] + "..." if len(upload.get("jd_text", "")) > 100 else upload.get("jd_text", ""),
                    "analysis_result": upload.get("analysis_result", {}),
                    "created_at": upload["created_at"].isoformat()
                })

            return JSONResponse(
                status_code=200,
                content={
                    "user_id": user_id,
                    "user_type": "employee",
                    "history": formatted_uploads
                }
            )

        elif user_type == "employer":
            # Get unique employer_ids created by this user
            employer_jobs = await db.employer_uploads.aggregate([
                {"$match": {"user_id": user_id}},
                {"$group": {
                    "_id": "$employer_id",
                    "jd_text": {"$first": "$jd_text"},
                    "created_at": {"$first": "$created_at"},
                    "count": {"$sum": 1}
                }},
                {"$sort": {"created_at": -1}},
                {"$limit": 20}
            ]).to_list(length=20)

            # Format the results
            formatted_jobs = []
            for job in employer_jobs:
                formatted_jobs.append({
                    "employer_id": job["_id"],
                    "jd_text": job.get("jd_text", "")[:100] + "..." if len(job.get("jd_text", "")) > 100 else job.get("jd_text", ""),
                    "candidate_count": job["count"],
                    "created_at": job["created_at"].isoformat()
                })

            return JSONResponse(
                status_code=200,
                content={
                    "user_id": user_id,
                    "user_type": "employer",
                    "history": formatted_jobs
                }
            )

        else:
            raise HTTPException(status_code=400, detail="Invalid user type")

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error retrieving history: {str(e)}")


if __name__ == '__main__':
    uvicorn.run("app:app", port=5000, reload=True)
