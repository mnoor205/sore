import Link from "next/link";
import { Sparkles, Check, Link2, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { signedInDestination } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  const destination = await signedInDestination(await getEnv());
  if (destination) redirect(destination);
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Link className="brand" href="/">
          <span className="brand-icon">c</span>coachlane
          <span className="wordmark-dot">.</span>
        </Link>
        <Link className="button light" href="/sign-in">
          Sign in
        </Link>
      </nav>
      <main className="landing-main">
        <div className="landing-copy">
          <span className="eyebrow purple">
            A LITTLE LINK. A PLACE FOR YOUR BIG IDEAS.
          </span>
          <h1>
            Your expertise.
            <br />A storefront
            <br />
            of its <em>own.</em>
          </h1>
          <p>
            Give your workbooks, templates, and best ideas a home. One beautiful
            bio link. A simpler way to share what you know.
          </p>
          <div className="actions">
            <Link href="/sign-up" className="button primary">
              Build your storefront
            </Link>
            <Link href="/sign-in" className="button outline">
              Sign in with email
            </Link>
          </div>
          <div className="landing-checks">
            <span>
              <Check size={16} /> Free and paid resources
            </span>
            <span>
              <Check size={16} /> Your own storefront
            </span>
          </div>
        </div>
        <div className="landing-art">
          <div className="floating-label">
            <span className="tiny-icon">
              <Link2 size={18} />
            </span>{" "}
            Your knowledge, one link away.
          </div>
          <div className="landing-phone">
            <div className="phone-notch" />
            <div className="avatar large">JL</div>
            <h3>Jamie Lane</h3>
            <p>
              Helping you build a business
              <br />
              that works for you.
            </p>
            <span className="micro-label">FICTIONAL DEMO STOREFRONT</span>
            <div className="mini-cover">
              <img
                src="/art/business-reset.svg"
                alt="The Business Reset workbook cover"
              />
            </div>
            <div className="phone-product">
              <b>The Business Reset</b>
              <small>A little clarity. A fresh direction.</small>
              <div>
                Get the workbook <strong>$29</strong>
              </div>
            </div>
            <div className="mini-link">
              <span className="tiny-icon">
                <Sparkles size={20} />
              </span>
              <div>
                <b>Your next big idea</b>
                <small>Start with the free clarity guide</small>
              </div>
              <span>Free</span>
            </div>
          </div>
          <div className="floating-security">
            <ShieldCheck size={20} />
            <div>
              <b>Your work. Your customers.</b>
              <small>Secure checkout, simple delivery.</small>
            </div>
          </div>
          <span className="art-spark spark-one">✳</span>
          <span className="art-spark spark-two">✦</span>
        </div>
      </main>
      <footer className="landing-footer">
        <span>Made for independent minds.</span>
        <span>Storefronts · Digital resources · Connected insights</span>
        <Link href="/privacy">Privacy & terms</Link>
      </footer>
    </div>
  );
}
