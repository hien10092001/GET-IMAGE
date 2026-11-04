import { Router } from 'express'
import nodemailer from 'nodemailer'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

const splitEmails = (value) =>
  String(value || '')
    .split(/[,;]/)
    .map((email) => email.trim())
    .filter(Boolean)

const stripHtml = (html) =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const isConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

const IMG_TAG_RE = /<img\b[^>]*>/gi

const extractInlineImages = async (html) => {
  const source = String(html || '')
  if (!source) return { html: source, inline: [], warnings: [] }
  const tags = source.match(IMG_TAG_RE) || []
  const inline = []
  const warnings = []
  let next = source
  let index = 0
  for (const tag of tags) {
    const srcMatch = tag.match(/(\bsrc\s*=\s*)(["']?)([^"'\s>]*)\2/i)
    if (!srcMatch) continue
    const rawSrc = srcMatch[3] || ''
    if (!rawSrc || /^cid:/i.test(rawSrc)) continue
    const src = rawSrc.startsWith('//') ? `https:${rawSrc}` : rawSrc
    let buffer
    let contentType
    let error = ''
    const dataMatch = src.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/i)
    if (dataMatch) {
      contentType = dataMatch[1] || 'image/png'
      if (!/^image\//i.test(contentType)) continue
      try {
        buffer = dataMatch[2]
          ? Buffer.from(dataMatch[3], 'base64')
          : Buffer.from(decodeURIComponent(dataMatch[3]))
      } catch {
        error = 'Dữ liệu ảnh không hợp lệ'
      }
    } else if (/^https?:\/\//i.test(src) && typeof fetch === 'function') {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 10000)
        const response = await fetch(src, { signal: controller.signal })
        clearTimeout(timer)
        if (!response.ok) {
          error = `Máy chủ không tải được ảnh (HTTP ${response.status})`
        } else {
          const type = response.headers.get('content-type') || ''
          if (type && !/^image\//i.test(type)) {
            error = 'Đường dẫn ảnh không trả về hình ảnh'
          } else {
            contentType = type.split(';')[0] || 'image/png'
            buffer = Buffer.from(await response.arrayBuffer())
          }
        }
      } catch {
        error = 'Máy chủ không tải được ảnh (bị chặn hoặc cần đăng nhập)'
      }
    } else {
      error = 'Ảnh dùng đường dẫn nội bộ nên người nhận không xem được'
    }
    if (error) {
      warnings.push(error)
      continue
    }
    if (!buffer || !buffer.length || buffer.length > 8 * 1024 * 1024) {
      warnings.push('Ảnh rỗng hoặc quá lớn (giới hạn 8MB)')
      continue
    }
    index += 1
    const ext = (contentType.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png'
    const cid = `signed-image-${Date.now()}-${index}@recap`
    inline.push({
      filename: `signature-${index}.${ext}`,
      content: buffer,
      contentType,
      cid,
      contentDisposition: 'inline',
    })
    const rewrittenTag = tag.replace(srcMatch[0], `${srcMatch[1]}${srcMatch[2]}cid:${cid}${srcMatch[2]}`)
    next = next.split(tag).join(rewrittenTag)
  }
  return { html: next, inline, warnings }
}

router.post('/send-recap', authMiddleware, async (req, res) => {
  try {
    const { to, cc, subject, text, html, filename, contentBase64, attachments: rawAttachments } = req.body || {}
    const recipients = splitEmails(to || process.env.RECAP_EMAIL_TO)
    const attachments = (Array.isArray(rawAttachments) ? rawAttachments : [])
      .filter((attachment) => attachment?.filename && attachment?.contentBase64)
    if (!attachments.length && filename && contentBase64) {
      attachments.push({ filename, contentBase64 })
    }

    if (!recipients.length) {
      return res.status(400).json({ message: 'Chưa có email nhận. Nhập email hoặc cấu hình RECAP_EMAIL_TO.' })
    }
    if (!attachments.length) {
      return res.status(400).json({ message: 'Thiếu file đính kèm.' })
    }
    if (!isConfigured()) {
      return res.status(503).json({
        message: 'Chưa cấu hình SMTP. Thêm SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS vào .env.',
      })
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const { html: finalHtml, inline, warnings } = await extractInlineImages(html)

    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: recipients.join(', '),
      cc: splitEmails(cc).join(', ') || undefined,
      subject: subject || 'Báo cáo sản lượng',
      text: finalHtml ? stripHtml(finalHtml) : (text || ''),
      html: finalHtml || undefined,
      attachments: [
        ...attachments.map((attachment) => ({
          filename: attachment.filename,
          content: Buffer.from(attachment.contentBase64, 'base64'),
        })),
        ...inline,
      ],
    })

    res.json({ ok: true, messageId: info.messageId, warnings })
  } catch (e) {
    res.status(500).json({ message: e.message })
  }
})

export default router
