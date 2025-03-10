from fastapi import FastAPI, HTTPException, Depends, status, Form, Security
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field, field_validator
from passlib.context import CryptContext  # type: ignore
from typing import Optional, Annotated
import os
from datetime import datetime, timedelta
import jwt
from bson import ObjectId
from db import get_db

# Password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT setup
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("No SECRET_KEY environment variable set for JWT")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# Pydantic models for request validation


class EmployerRegistration(BaseModel):
    business_email: EmailStr
    company_name: str = Field(..., min_length=2, max_length=100)
    password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)

    @field_validator('confirm_password')
    def passwords_match(cls, v, info):
        password = info.data.get('password')
        if password is not None and v != password:
            raise ValueError('Passwords do not match')
        return v


class EmployeeRegistration(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)

    @field_validator('confirm_password')
    def passwords_match(cls, v, info):
        password = info.data.get('password')
        if password is not None and v != password:
            raise ValueError('Passwords do not match')
        return v


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None
    user_type: Optional[str] = None


# Authentication middleware - fixed tokenUrl to match actual endpoint
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")

# Helper functions for auth


async def get_user_by_email(db, email: str, user_type: str):
    collection = db[user_type + "s"]  # "employers" or "employees"
    user = await collection.find_one({"email": email})
    return user


def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password):
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY,   # type: ignore
                             algorithm=ALGORITHM)
    return encoded_jwt


async def authenticate_user(db, email: str, password: str, user_type: str):
    user = await get_user_by_email(db, email, user_type)
    if not user:
        return False
    if not verify_password(password, user["password"]):
        return False
    return user

# Fixed get_current_user function to properly handle authentication


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[  # type: ignore
                             ALGORITHM])  # type: ignore
        email: str = payload.get("sub")
        user_type: str = payload.get("user_type")
        if email is None or user_type is None:
            raise credentials_exception
        token_data = TokenData(email=email, user_type=user_type)
    except jwt.PyJWTError:
        raise credentials_exception

    db = get_db()

    user = await get_user_by_email(db, token_data.email,  # type: ignore
                                   token_data.user_type)  # type: ignore
    if user is None:
        raise credentials_exception
    return user

# Fixed employee type dependency for specific user type validation


async def get_current_employee(current_user=Depends(get_current_user)):
    if current_user.get("user_type") != "employee":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized - employee access required"
        )
    return current_user

# Fixed employer type dependency for specific user type validation


async def get_current_employer(current_user=Depends(get_current_user)):
    if current_user.get("user_type") != "employer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized - employer access required"
        )
    return current_user

# Routes to add to FastAPI app


def add_auth_routes(app: FastAPI):
    @app.post("/api/register/employer", response_model=dict)
    async def register_employer(employer: EmployerRegistration):
        db = get_db()
        # Check if user already exists
        existing_user = await get_user_by_email(db, employer.business_email, "employer")
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Create new employer
        hashed_password = get_password_hash(employer.password)
        employer_data = {
            "email": employer.business_email,
            "company_name": employer.company_name,
            "password": hashed_password,
            "user_type": "employer",  # Added user_type field for validation
            "created_at": datetime.now(),
            "is_active": True
        }

        result = await db.employers.insert_one(employer_data)
        return {"id": str(result.inserted_id), "message": "Employer registered successfully"}

    @app.post("/api/register/employee", response_model=dict)
    async def register_employee(employee: EmployeeRegistration):
        db = get_db()
        # Check if user already exists
        existing_user = await get_user_by_email(db, employee.email, "employee")
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Create new employee
        hashed_password = get_password_hash(employee.password)
        employee_data = {
            "email": employee.email,
            "full_name": employee.full_name,
            "password": hashed_password,
            "user_type": "employee",  # Added user_type field for validation
            "created_at": datetime.now(),
            "is_active": True
        }

        result = await db.employees.insert_one(employee_data)
        return {"id": str(result.inserted_id), "message": "Employee registered successfully"}

    @app.post("/api/token", response_model=Token)
    async def login_for_access_token(
        form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
        user_type: str = Form(...)  # "employer" or "employee"
    ):
        db = get_db()
        user = await authenticate_user(db, form_data.username, form_data.password, user_type)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user["email"], "user_type": user_type},
            expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
