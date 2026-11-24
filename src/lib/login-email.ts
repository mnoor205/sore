import { emailLayout } from "./email-layout";

export function loginEmail(code: string) {
  if (!/^\d{6}$/.test(code)) throw new Error("Invalid login code");
  return {
    subject: "Your Sore sign-in code",
    text: `SORE\nYour workspace is one code away.\n\nYour sign-in code: ${code}\n\nEnter this code in the browser where you requested it. It expires in 10 minutes and works once. Never share this code.\n\nIf you didn't request this email, you can ignore it.\n\nSore · A home for your expertise\nhttps://getsore.me`,
    html: emailLayout({
      title: "Your Sore sign-in code",
      preview: "Your workspace is one code away. Valid for 10 minutes.",
      category: "YOUR WORKSPACE",
      content: `
<h1 class="email-heading" style="margin:0 0 22px;font-size:42px;line-height:1.12;font-weight:600;letter-spacing:-1.8px;color:#f5f5f5">Your workspace.<br><span style="color:#ff83bd">One code away.</span></h1>
<p style="margin:0 0 30px;color:#a1a1a1;font-size:15px;line-height:25px">A little less admin. A little more creating.<br>Enter the code below in your browser to sign in to sore.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:26px 24px;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:16px">
  <p style="margin:0 0 16px;color:#999999;font-size:10px;line-height:16px;letter-spacing:1.6px">YOUR SIGN-IN CODE</p>
  <p class="email-code" style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:44px;line-height:1.2;font-weight:600;letter-spacing:9px;color:#f5f5f5">${code}</p>
  <p style="margin:18px 0 0;font-size:12px;line-height:20px;color:#a1a1a1"><span style="color:#ff83bd">Valid for 10 minutes</span><span style="color:#555555"> &nbsp;·&nbsp; </span>One-time use</p>
</td></tr></table>
<p style="margin:22px 0 0;color:#999999;font-size:12px;line-height:20px">Keep this code to yourself. We’ll never ask you to share it.</p>`,
      note: "Didn’t request a code? You can ignore this email. Your account stays secure.",
    }),
  };
}
