import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { parseWhatsAppChat, detectMessageDirection, isValidWhatsAppExport } from '@/lib/whatsappParser';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ customerId: string }> }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { customerId } = await context.params;

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user has access to this customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, owner_id, assigned_to')
      .eq('id', customerId)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (customer.owner_id !== user.id && customer.assigned_to !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const myCompanyKeywords = formData.get('myCompanyKeywords') as string || '';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Read file content
    const fileContent = await file.text();

    // Validate WhatsApp export format
    if (!isValidWhatsAppExport(fileContent)) {
      return NextResponse.json({
        error: 'Invalid WhatsApp export format. Please upload a .txt file exported from WhatsApp.'
      }, { status: 400 });
    }

    // Parse WhatsApp chat
    const messages = parseWhatsAppChat(fileContent);

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages found in file' }, { status: 400 });
    }

    // Upload original file to Supabase Storage
    const timestamp = Date.now();
    const fileName = `whatsapp_${customerId}_${timestamp}.txt`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('communication-files')
      .upload(fileName, file, {
        contentType: 'text/plain',
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
    }

    // Get public URL of uploaded file
    const { data: { publicUrl } } = supabase.storage
      .from('communication-files')
      .getPublicUrl(fileName);

    // Parse company keywords for direction detection
    const keywords = myCompanyKeywords
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    // Insert messages into communication_logs
    const logsToInsert = messages.map(msg => ({
      customer_id: customerId,
      channel: 'whatsapp',
      direction: detectMessageDirection(msg.senderName, keywords),
      sender_name: msg.senderName,
      content: msg.content,
      sent_at: msg.sentAt.toISOString(),
      original_file_url: publicUrl,
      created_by: user.id,
    }));

    const { data: insertedLogs, error: insertError } = await supabase
      .from('communication_logs')
      .insert(logsToInsert)
      .select();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save messages' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageCount: messages.length,
      fileUrl: publicUrl,
      logs: insertedLogs,
    });

  } catch (error) {
    console.error('Import WhatsApp error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
