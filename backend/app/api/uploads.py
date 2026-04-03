import uuid
import aioboto3
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from botocore.exceptions import ClientError
from app.core.security import get_current_user
from app.core.config import (
    AWS_ACCESS_KEY_ID, 
    AWS_SECRET_ACCESS_KEY, 
    AWS_REGION, 
    S3_BUCKET_NAME
)

router = APIRouter()

def get_s3_session():
    """Returns an aioboto3 session properly configured."""
    return aioboto3.Session(
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION
    )

@router.post("/upload")
async def upload_file_to_s3(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """
    Streams file chunks directly to AWS S3 using Multipart Upload.
    The file is never temporarily saved entirely on local storage memory/disk.
    """
    user_id = current_user["user_id"]
    
    # Simple extension parsing
    file_extension = file.filename.split(".")[-1] if "." in file.filename else "bin"
    file_key = f"uploads/{user_id}/{uuid.uuid4()}.{file_extension}"
    
    session = get_s3_session()
    
    # 5MB is the absolute minimum chunk size for S3 multipart uploads.
    chunk_size = 5 * 1024 * 1024 
    
    async with session.client("s3") as s3_client:
        try:
            # 1. Initiate Multipart Upload
            multipart_upload = await s3_client.create_multipart_upload(
                Bucket=S3_BUCKET_NAME,
                Key=file_key,
                Metadata={"sender_uuid": user_id}
            )
            upload_id = multipart_upload["UploadId"]
            parts = []
            part_number = 1
            
            # 2. Iterate and Stream file iteratively
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                    
                # Upload matching Part
                part = await s3_client.upload_part(
                    Bucket=S3_BUCKET_NAME,
                    Key=file_key,
                    PartNumber=part_number,
                    UploadId=upload_id,
                    Body=chunk
                )
                
                parts.append({
                    "PartNumber": part_number,
                    "ETag": part["ETag"]
                })
                part_number += 1
                
            # 3. Finalize upload
            await s3_client.complete_multipart_upload(
                Bucket=S3_BUCKET_NAME,
                Key=file_key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts}
            )
            
            # 4. Generate Pre-signed valid for 1 hour (3600 seconds)
            presigned_url = await s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': S3_BUCKET_NAME, 'Key': file_key},
                ExpiresIn=3600
            )
            
            return {
                "message": "File fallback upload successful",
                "key": file_key,
                "url": presigned_url
            }
            
        except ClientError as e:
            # If any failure occurs, we definitively abort the multipart upload
            # so that abandoned parts do not incur S3 storage costs.
            if 'upload_id' in locals():
                await s3_client.abort_multipart_upload(
                    Bucket=S3_BUCKET_NAME,
                    Key=file_key,
                    UploadId=upload_id
                )
            raise HTTPException(status_code=500, detail=f"S3 Streaming failed: {str(e)}")
        except Exception as e:
            if 'upload_id' in locals():
                await s3_client.abort_multipart_upload(
                    Bucket=S3_BUCKET_NAME,
                    Key=file_key,
                    UploadId=upload_id
                )
            raise HTTPException(status_code=500, detail=f"Unexpected Error streaming to S3: {str(e)}")
