import { NextResponse } from 'next/server';
import crypto from 'crypto';

const HMAC_SECRET = process.env.HMAC_SECRET || 'aea0bf03b9b243dfbdc281543d16d073dca1550d7cd07d67600e1a90373af73c';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bodyString = JSON.stringify(body);
    
    // Generate HMAC signature
    const hmac = crypto
      .createHmac('sha256', HMAC_SECRET)
      .update(bodyString)
      .digest('hex');
    
    return NextResponse.json({ 
      signature: hmac,
      body: bodyString,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
