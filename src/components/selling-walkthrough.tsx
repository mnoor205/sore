import { Check, Download, Link2, Instagram, FileText } from "lucide-react";

export default function SellingWalkthrough() {
  return (
    <section id="how-it-works" className="sf-container sf-section sf-selling">
      <div className="sf-section-heading">
        <div>
          <span className="sf-eyebrow">LESS ADMIN. MORE CREATING.</span>
          <h2>
            Your next launch,
            <br />
            without the busywork.
          </h2>
        </div>
        <p>
          One simple flow. <br />
          From your file to their download.
        </p>
      </div>
      <ol
        className="sf-selling-flow"
        aria-label="Illustrative digital product selling flow"
      >
        <li>
          <div
            className="sf-selling-visual sf-selling-upload"
            role="img"
            aria-label="Example workbook file added to a product priced at 29 dollars"
          >
            <img
              src="/art/business-reset.svg"
              alt=""
              className="sf-selling-cover"
            />
            <div className="sf-selling-file">
              <FileText size={17} />
              <span>business-reset.pdf</span>
              <Check size={15} />
            </div>
            <span className="sf-selling-price">
              Your price <strong>$29</strong>
            </span>
          </div>
          <div className="sf-selling-copy">
            <h3>Add your product.</h3>
            <p>A file, a cover, and your price.</p>
          </div>
        </li>
        <li>
          <div
            className="sf-selling-visual sf-selling-share"
            role="img"
            aria-label="Example social profile linking to Jamie Lane’s Sore storefront"
          >
            <Instagram size={24} className="sf-selling-social-icon" />
            <span className="sf-selling-profile">JL</span>
            <strong>Jamie Lane</strong>
            <span>Business coach & creator</span>
            <div className="sf-selling-bio-link">
              <Link2 size={16} />
              getsore.me/jamie
            </div>
            <div className="sf-selling-link-tail" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          </div>
          <div className="sf-selling-copy">
            <h3>Share one link.</h3>
            <p>Your whole store, right in your bio.</p>
          </div>
        </li>
        <li>
          <div
            className="sf-selling-visual sf-selling-deliver"
            role="img"
            aria-label="Illustrative customer download after checkout"
          >
            <span className="sf-selling-ready">
              <Check size={27} />
            </span>
            <strong>It’s yours.</strong>
            <span>The Business Reset</span>
            <div className="sf-selling-download">
              <Download size={16} />
              Download workbook
            </div>
            <span className="sf-selling-filetype">PDF WORKBOOK</span>
          </div>
          <div className="sf-selling-copy">
            <h3>Deliver the download.</h3>
            <p>A simple path from checkout to file.</p>
          </div>
        </li>
      </ol>
      <p className="sf-selling-preview">
        Illustrative flow · Checkout launching soon
      </p>
    </section>
  );
}
