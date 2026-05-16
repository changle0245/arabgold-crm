import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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
    const direction = formData.get('direction') as string;
    const subject = formData.get('subject') as string || '';
    const content = formData.get('content') as string;
    const sentAt = formData.get('sentAt') as string;
    const attachments = formData.getAll('attachments') as File[];

    if (!direction || !content || !sentAt) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (direction !== 'outgoing' && direction !== 'incoming') {
      return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
    }

    // Upload attachments to storage (if any)
    const attachmentUrls: string[] = [];
    for (const file of attachments) {
      if (file.size > 0) {
        const timestamp = Date.now();
        const ext = file.name.split('.').pop() || 'bin';
        const fileName = `email_${customerId}_${timestamp}_${Math.random().toString(36).substring(7)}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('communication-files')
          .upload(fileName, file, {
            contentType: file.type,
            cacheControl: '3600',
          });

        if (uploadError) {
          console.error('Attachment upload error:', uploadError);
          continue; // Skip this file, don't fail the whole request
        }

        const { data: { publicUrl } } = supabase.storage
          .from('communication-files')
          .getPublicUrl(fileName);

        attachmentUrls.push(publicUrl);
      }
    }

    // Format email content with subject and attachments
    let fullContent = content;
    if (subject) {
      fullContent = `[主题: ${subject}]\n\n${content}`;
    }
    if (attachmentUrls.length > 0) {
      fullContent += `\n\n[附件 ${attachmentUrls.length} 个]:\n${attachmentUrls.map((url, i) => `${i + 1}. ${url}`).join('\n')}`;
    }

    // Insert email record into communication_logs
    const { data: insertedLog, error: insertError } = await supabase
      .from('communication_logs')
      .insert({
        customer_id: customerId,
        channel: 'email',
        direction,
        sender_name: direction === 'outgoing' ? '我方' : customer.contact_name || '客户',
        content: fullContent,
        sent_at: sentAt,
        original_file_url: attachmentUrls[0] || null, // Store first attachment URL in original_file_url
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return NextResponse.json({ error: 'Failed to save email record' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      log: insertedLog,
      attachmentCount: attachmentUrls.length,
    });

  } catch (error) {
    console.error('Record email error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
