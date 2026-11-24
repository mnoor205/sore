// Table layout and inline styles support mail clients without web fonts or CSS gradients.
export function escapeEmailHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export function emailLayout({
  title,
  preview,
  category,
  content,
  note,
}: {
  title: string;
  preview: string;
  category: string;
  content: string;
  note: string;
}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeEmailHtml(title)}</title>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body, table, td, a { -webkit-text-size-adjust: 100%; }
  table { border-collapse: separate; border-spacing: 0; }
  a { color: #ededed; }
  @media only screen and (max-width: 480px) {
    .email-gutter { padding: 24px 20px !important; }
    .email-heading { font-size: 36px !important; letter-spacing: -1.5px !important; }
    .email-code { font-size: 36px !important; letter-spacing: 6px !important; }
    .email-category { font-size: 9px !important; letter-spacing: 1px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background:#000000;color:#ededed;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;font-size:1px;line-height:1px;color:#000000;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${escapeEmailHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background:#000000">
<tr><td align="center" class="email-gutter" style="padding:40px 28px">
<!--[if mso]><table role="presentation" width="520"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 0 28px;border-bottom:1px solid #242424">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-size:30px;line-height:36px;font-weight:bold;letter-spacing:-1.5px;color:#f5f5f5;white-space:nowrap"><a href="https://getsore.me" style="text-decoration:none;color:#f5f5f5"><img src="https://getsore.me/brand/sore-mark-email.png" width="30" height="30" alt="" style="display:inline-block;width:30px;height:30px;vertical-align:-4px;border:0;margin-right:8px"><span>sore</span></a></td>
    <td align="right" class="email-category" style="font-size:10px;line-height:16px;font-weight:normal;letter-spacing:1.6px;color:#999999">${escapeEmailHtml(category)}</td>
  </tr></table>
</td></tr>
<tr><td style="padding:40px 0 36px">${content}</td></tr>
<tr><td style="padding:24px 0 0;border-top:1px solid #242424">
  <p style="margin:0 0 22px;color:#999999;font-size:12px;line-height:20px">${escapeEmailHtml(note)}</p>
  <p style="margin:0;color:#ededed;font-size:12px;line-height:20px">A home for your expertise.</p>
  <p style="margin:4px 0 0;font-size:12px;line-height:20px"><a href="https://getsore.me" style="color:#999999;text-decoration:none">getsore.me</a></p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
}
