import { emailLayout, escapeEmailHtml } from "./email-layout";

export function resourceEmail(payload: {
  name: string;
  title: string;
  url: string;
}) {
  const url = new URL(payload.url);
  if (!["https:", "http:"].includes(url.protocol))
    throw new Error("Invalid resource access URL");
  const accessUrl = escapeEmailHtml(payload.url);
  return {
    subject: `Your resource: ${payload.title}`,
    text: `Hi ${payload.name},\n\nYour resource is ready: ${payload.title}\n\nAccess your purchase: ${payload.url}\n\nKeep this private access link safe. Contact the creator for support.`,
    html: emailLayout({
      title: "Your resource is ready",
      preview: `Ready when you are: ${payload.title}`,
      category: "YOUR DOWNLOAD",
      content: `
<h1 class="email-heading" style="margin:0 0 22px;font-size:42px;line-height:1.12;font-weight:600;letter-spacing:-1.8px;color:#f5f5f5">A little inspiration.<br><span style="color:#ff83bd">All yours.</span></h1>
<p style="margin:0 0 30px;color:#a1a1a1;font-size:15px;line-height:25px">Hi ${escapeEmailHtml(payload.name)}, your resource is ready.<br>Make a little room for your next idea.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:26px 24px;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:16px">
  <p style="margin:0 0 12px;color:#999999;font-size:10px;line-height:16px;letter-spacing:1.6px">READY WHEN YOU ARE</p>
  <h2 style="margin:0 0 24px;color:#f5f5f5;font-size:23px;line-height:30px;font-weight:600;letter-spacing:-0.6px;overflow-wrap:anywhere">${escapeEmailHtml(payload.title)}</h2>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#b5096b" style="background:#b5096b;background-image:linear-gradient(100deg,#b5096b,#c33748);border-radius:999px;mso-padding-alt:15px 26px;text-align:center"><a href="${accessUrl}" style="display:inline-block;padding:15px 26px;color:#ffffff;font-size:14px;line-height:22px;font-weight:bold;text-decoration:none;border-radius:999px">Access your resource&nbsp; &#8594;</a></td></tr></table>
</td></tr></table>
<p style="margin:22px 0 0;color:#999999;font-size:12px;line-height:20px">Button not opening? <a href="${accessUrl}" style="color:#ededed;text-decoration:underline">Use your private access link.</a></p>`,
      note: "Keep this private link safe. For product questions or help with your download, contact the creator through their storefront.",
    }),
  };
}
