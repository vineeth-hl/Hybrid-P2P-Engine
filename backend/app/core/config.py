import os

# For production, set this securely via environment variables
SECRET_KEY = os.environ.get("SECRET_KEY", "78468cf007b2bc40695fbd1b91006d84d30c1410d1ef5d046b615b62d259aa14")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 120  # 2 hours

# AWS and S3 Setup
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.environ.get("AWS_REGION", "ap-south-1")
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "my-hybrid-p2p-transfer-bucket-123")
