import boto3
import os
import shutil
import structlog
from typing import List, Optional

logger = structlog.get_logger()

class OutputUploader:
    def __init__(self, bucket_name: str, region: str = "ap-northeast-2"):
        self.bucket = bucket_name
        self.region = region
        self.s3 = boto3.client('s3', region_name=region)

    def upload_outputs(self, job_id: str, source_dir: str) -> List[str]:
        """
        Uploads all files from source_dir to S3 and returns list of URLs.
        """
        uploaded_urls = []
        
        if not os.path.exists(source_dir):
            logger.warning("Output directory not found", job_id=job_id, path=source_dir)
            return uploaded_urls

        try:
            # Recursive Upload using os.walk (User UX Enhancement)
            for root, dirs, files in os.walk(source_dir):
                for filename in files:
                    filepath = os.path.join(root, filename)
                    
                    # Calculate relative path (e.g. "images/v1/result.png")
                    relative_path = os.path.relpath(filepath, source_dir)
                    
                    # Ensure S3 keys always use forward slashes (Windows protection)
                    safe_relative_path = relative_path.replace(os.path.sep, '/')
                    
                    s3_key = f'outputs/{job_id}/{safe_relative_path}'
                    
                    if self.bucket:
                        # logger.debug("Uploading output file", file=safe_relative_path)
                        self.s3.upload_file(filepath, self.bucket, s3_key)
                        
                        # Public URL Generation
                        url = f'https://{self.bucket}.s3.{self.region}.amazonaws.com/{s3_key}'
                        uploaded_urls.append(url)
                    else:
                         logger.warning("Skipping upload: No bucket configured", file=filename)
                    
        except Exception as e:
            logger.error("Failed to upload outputs", job_id=job_id, error=str(e))
            
        return uploaded_urls
