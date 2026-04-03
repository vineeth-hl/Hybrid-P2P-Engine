import os
import sys
import boto3
from botocore.exceptions import ClientError

# Add the backend path so we can import the AWS credentials you just set in config.py
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../backend')))
from app.core.config import AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME

def apply_s3_lifecycle():
    """
    Applies the ultimate failsafe lifecycle policy to the S3 bucket.
    """
    s3_client = boto3.client(
        's3',
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        region_name=AWS_REGION
    )

    # AWS S3 Lifecycle policies strictly enforce a minimum expiration period of 1 Day (24 hours).
    # It is impossible to set an 'hours' metric natively in S3 Lifecycle policies.
    # We set it to 1 Day safely here. Your Step 3.4 will handle the immediate 1-hour 
    # cleanup later using an AWS Lambda!
    lifecycle_configuration = {
        'Rules': [
            {
                'ID': '24-Hour-Automatic-Data-Destruction',
                'Filter': {
                    'Prefix': 'uploads/'
                },
                'Status': 'Enabled',
                'Expiration': {
                    'Days': 1
                },
                # Crucial setting: Instantly aborts orphaned streaming chunks 
                # that were abandoned midway so they don't cost you money.
                'AbortIncompleteMultipartUpload': {
                    'DaysAfterInitiation': 1
                }
            }
        ]
    }

    try:
        print(f"Applying Lifecycle Policy to S3 Bucket: '{S3_BUCKET_NAME}'...")
        s3_client.put_bucket_lifecycle_configuration(
            Bucket=S3_BUCKET_NAME,
            LifecycleConfiguration=lifecycle_configuration
        )
        print("Success! AWS S3 will now automatically destroy orphaned files and incomplete streams after 1 day.")
    except ClientError as e:
        print(f"Failed to apply lifecycle policy. AWS Error: {e}")

if __name__ == "__main__":
    apply_s3_lifecycle()
