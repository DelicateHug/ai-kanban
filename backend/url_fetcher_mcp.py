"""
URL Fetcher MCP Server - Fetches content from URLs
This server provides API endpoints for fetching web content.
"""

import asyncio
import aiohttp
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import re

app = FastAPI(title="URL Fetcher MCP Server", version="1.0.0")

# Enable CORS for the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class FetchURLRequest(BaseModel):
    url: str
    extract_text: bool = True  # If True, extract readable text; if False, return raw HTML
    timeout: int = 30
    headers: Optional[dict] = None

class FetchURLResponse(BaseModel):
    success: bool
    url: str
    content: Optional[str] = None
    title: Optional[str] = None
    status_code: Optional[int] = None
    content_type: Optional[str] = None
    error: Optional[str] = None

class FetchMultipleRequest(BaseModel):
    urls: List[str]
    extract_text: bool = True
    timeout: int = 30

class FetchMultipleResponse(BaseModel):
    success: bool
    results: List[FetchURLResponse]

class ToolCallRequest(BaseModel):
    tool: str
    input: dict

class ToolCallResponse(BaseModel):
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None


def clean_text(text: str) -> str:
    """Clean up extracted text by removing extra whitespace."""
    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text)
    # Remove leading/trailing whitespace from lines
    lines = [line.strip() for line in text.split('\n')]
    # Remove empty lines
    lines = [line for line in lines if line]
    return '\n'.join(lines)


def extract_readable_text(html: str) -> tuple[str, Optional[str]]:
    """Extract readable text from HTML content."""
    soup = BeautifulSoup(html, 'html.parser')
    
    # Get title
    title = None
    title_tag = soup.find('title')
    if title_tag:
        title = title_tag.get_text(strip=True)
    
    # Remove script and style elements
    for script in soup(["script", "style", "nav", "footer", "header", "aside"]):
        script.decompose()
    
    # Get text
    text = soup.get_text(separator='\n')
    text = clean_text(text)
    
    return text, title


async def fetch_url(url: str, extract_text: bool = True, timeout: int = 30, headers: Optional[dict] = None) -> FetchURLResponse:
    """Fetch content from a URL."""
    default_headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    if headers:
        default_headers.update(headers)
    
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            async with session.get(url, headers=default_headers, ssl=False) as response:
                content_type = response.headers.get('Content-Type', '')
                html = await response.text()
                
                if extract_text and 'text/html' in content_type:
                    content, title = extract_readable_text(html)
                else:
                    content = html
                    title = None
                
                return FetchURLResponse(
                    success=True,
                    url=url,
                    content=content,
                    title=title,
                    status_code=response.status,
                    content_type=content_type
                )
    except asyncio.TimeoutError:
        return FetchURLResponse(
            success=False,
            url=url,
            error=f"Request timed out after {timeout} seconds"
        )
    except aiohttp.ClientError as e:
        return FetchURLResponse(
            success=False,
            url=url,
            error=f"HTTP error: {str(e)}"
        )
    except Exception as e:
        return FetchURLResponse(
            success=False,
            url=url,
            error=f"Error fetching URL: {str(e)}"
        )


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "URL Fetcher MCP Server", "port": 8766}


@app.post("/fetch", response_model=FetchURLResponse)
async def fetch_single_url(request: FetchURLRequest):
    """Fetch content from a single URL."""
    return await fetch_url(
        url=request.url,
        extract_text=request.extract_text,
        timeout=request.timeout,
        headers=request.headers
    )


@app.post("/fetch-multiple", response_model=FetchMultipleResponse)
async def fetch_multiple_urls(request: FetchMultipleRequest):
    """Fetch content from multiple URLs concurrently."""
    tasks = [
        fetch_url(url, request.extract_text, request.timeout)
        for url in request.urls
    ]
    results = await asyncio.gather(*tasks)
    
    return FetchMultipleResponse(
        success=all(r.success for r in results),
        results=results
    )


@app.post("/tool", response_model=ToolCallResponse)
async def call_tool(request: ToolCallRequest):
    """Generic tool call endpoint for MCP compatibility."""
    tool = request.tool
    input_data = request.input
    
    try:
        if tool == "fetch_url":
            url = input_data.get("url")
            if not url:
                return ToolCallResponse(success=False, error="Missing 'url' parameter")
            
            result = await fetch_url(
                url=url,
                extract_text=input_data.get("extract_text", True),
                timeout=input_data.get("timeout", 30),
                headers=input_data.get("headers")
            )
            
            return ToolCallResponse(
                success=result.success,
                data={
                    "url": result.url,
                    "content": result.content,
                    "title": result.title,
                    "status_code": result.status_code,
                    "content_type": result.content_type
                } if result.success else None,
                error=result.error
            )
        
        elif tool == "fetch_multiple_urls":
            urls = input_data.get("urls")
            if not urls:
                return ToolCallResponse(success=False, error="Missing 'urls' parameter")
            
            tasks = [
                fetch_url(url, input_data.get("extract_text", True), input_data.get("timeout", 30))
                for url in urls
            ]
            results = await asyncio.gather(*tasks)
            
            return ToolCallResponse(
                success=all(r.success for r in results),
                data={
                    "results": [
                        {
                            "url": r.url,
                            "content": r.content,
                            "title": r.title,
                            "status_code": r.status_code,
                            "content_type": r.content_type,
                            "success": r.success,
                            "error": r.error
                        }
                        for r in results
                    ]
                }
            )
        
        else:
            return ToolCallResponse(
                success=False,
                error=f"Unknown tool: {tool}. Available tools: fetch_url, fetch_multiple_urls"
            )
    
    except Exception as e:
        return ToolCallResponse(success=False, error=str(e))


if __name__ == "__main__":
    import uvicorn
    print("Starting URL Fetcher MCP Server on port 8766...")
    uvicorn.run(app, host="0.0.0.0", port=8766)
