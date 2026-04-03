import boto3
from botocore.exceptions import ClientError
import logging

# Initialize standard logging structure for AWS CloudWatch
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Bind the underlying Boto3 S3 Client globally to allow execution context re-use
s3_client = boto3.client('s3')

def lambda_handler(event, context):
    """
    AWS Lambda: The "Burn-after-reading" Nuke Protocol.
    
    Trigger: Invoked securely via API Gateway or directly via FastAPI boto3 trigger.
    Expected Payload:
    {
        "bucket_name": "hybrid-p2p-storage-bucket",
        "object_key": "uuid/file.zip"
    }
    """
    bucket_name = event.get('bucket_name')
    object_key = event.get('object_key')
    
    if not bucket_name or not object_key:
        logger.error("Abort: Missing 'bucket_name' or 'object_key' in execution payload.")
        return {
            'statusCode': 400,
            'body': 'Bad Request: Missing Target Parameters'
        }

    try:
        # Step 1: Pre-flight Verification. We use head_object instead of get_object 
        # so we don't accidentally load the physical file into the Lambda's RAM.
        logger.info(f"Target Acquired: Validating existence of s3://{bucket_name}/{object_key}")
        s3_client.head_object(Bucket=bucket_name, Key=object_key)
        
        # Step 2: Protocol Engagement. Destruct the file permanently.
        logger.info("Validation complete. Engaging Nuke Protocol (DeleteObject).")
        s3_client.delete_object(Bucket=bucket_name, Key=object_key)
        
        logger.info(f"Success: The asset [{object_key}] has been permanently wiped from the bucket.")
        return {
            'statusCode': 200,
            'body': 'Asset successfully destroyed.'
        }
        
    except ClientError as ce:
        error_code = ce.response['Error']['Code']
        if error_code == '404':
            logger.warning(f"Aborted: The asset [{object_key}] does not exist. It may have already been purged or expired.")
            return {
                'statusCode': 404,
                'body': 'Target missing or already destroyed.'
            }
        else:
            logger.error(f"Critical S3 ClientError Failure: {str(ce)}")
            return {
                'statusCode': 500,
                'body': 'AWS Client error during protocol execution.'
            }
    except Exception as e:
        logger.error(f"Fatal Execution Failure: {str(e)}")
        return {
            'statusCode': 500,
            'body': 'Internal Server Error'
        }
