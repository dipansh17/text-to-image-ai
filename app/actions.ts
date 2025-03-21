"use server"

import OpenAI from 'openai';
import { rateLimiter } from './utils/rateLimiter';
import { headers } from 'next/headers';

const apiKey = process.env.NEBIUS_API_KEY;

if (!apiKey) {
  throw new Error('NEBIUS_API_KEY is not defined in environment variables');
}

const client = new OpenAI({
  baseURL: 'https://api.studio.nebius.com/v1/',
  apiKey: apiKey,
});

type ImageSize = "1024x1024" | "1024x1792" | "1792x1024";
type ImageResponse = {
  imageUrl: string | null;
  message?: string;
  statusCode?: number;
  remaining?: number;
};

export async function generateImage(prompt: string, size: string = "1024x1024"): Promise<ImageResponse> {
  // Get user's IP address
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || 'unknown';

  // Check rate limit
  const { limited, remaining } = rateLimiter.isRateLimited(ip);
  
  if (limited) {
    return {
      imageUrl: null,
      message: 'You have reached the maximum number of image generations (3 per 24 hours). Please try again later.',
      statusCode: 429,
      remaining: 0
    };
  }

  if (!apiKey) {
    return { 
      imageUrl: null, 
      message: "API key configuration error", 
      statusCode: 500 
    };
  }

  if (!prompt) {
    return { 
      imageUrl: null, 
      message: "Prompt is required", 
      statusCode: 400 
    };
  }

  try {
    const [width, height] = size.split('x').map(Number);

    const response = await client.images.generate({
      model: "black-forest-labs/flux-schnell",
      response_format: "b64_json",
      extra_body: {
        response_extension: "webp",
        width: width || 1024,
        height: height || 1024,
        num_inference_steps: 4,
        negative_prompt: "",
        seed: -1
      },
      prompt: prompt
    } as any);

    if (!response?.data?.[0]?.b64_json) {
      return { 
        imageUrl: null, 
        message: 'Failed to generate image: Invalid API response', 
        statusCode: 500 
      };
    }
    
    return { 
      imageUrl: response.data[0].b64_json,
      remaining
    };
  } catch (error: any) {
    console.error('Error generating image:', error);
    if (error.status === 401) {
      return { 
        imageUrl: null, 
        message: 'Invalid API key. Please check your NEBIUS_API_KEY environment variable.', 
        statusCode: 401 
      };
    }
    return { 
      imageUrl: null, 
      message: error.message || 'Failed to generate image. Please try again later.', 
      statusCode: 500 
    };
  }
}