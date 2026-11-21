"use client";
import { useEffect, useRef } from "react";
import { Download, Instagram } from "lucide-react";
const stores = [
  {
    name: "Jamie Lane",
    initials: "JL",
    role: "Business coach",
    title: "The Business Reset",
    description: "A little clarity. A fresh direction.",
    image: "business-reset",
    price: "$29",
    theme: "coach",
  },
  {
    name: "Alex Morgan",
    initials: "AM",
    role: "Creator & designer",
    title: "The Pricing Playbook",
    description: "Know your numbers. Shape your offer.",
    image: "pricing-playbook",
    price: "$19",
    theme: "creator",
  },
  {
    name: "Sam Rivera",
    initials: "SR",
    role: "Clarity coach",
    title: "Find Your Clarity",
    description: "Five questions. Your next step.",
    image: "clarity-guide",
    price: "Free",
    theme: "guide",
  },
];
export default function StorefrontPhones() {
  const canvas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const resize = () =>
      node.style.setProperty(
        "--sf-phone-scale",
        String(node.clientWidth / 1000),
      );
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <figure
      id="storefront"
      className="sf-phone-examples"
      aria-label="Illustrative iPhone storefront examples"
    >
      <div className="sf-phone-canvas" ref={canvas}>
        <div className="sf-phone-stage">
          {stores.map((store, i) => (
            <div
              className={`sf-iphone sf-phone-${store.theme}`}
              key={store.name}
            >
              <div className="sf-phone-screen">
                <div className="sf-phone-status">
                  <span>9:41</span>
                  <span className="sf-island" />
                  <span className="sf-phone-signal">▴ ▰</span>
                </div>
                <div className="sf-phone-url">
                  getsore.me / {store.name.toLowerCase().split(" ")[0]}
                </div>
                <div className="sf-phone-profile">
                  <div className="sf-phone-avatar">{store.initials}</div>
                  <h2>{store.name}</h2>
                  <p>{store.role}</p>
                  <Instagram size={13} />
                </div>
                <div className="sf-phone-product">
                  <img
                    src={`/art/${store.image}.svg`}
                    alt={`${store.title} sample digital product`}
                  />
                  <span className="sf-phone-type">
                    {i === 1 ? "TEMPLATE & GUIDE" : "DIGITAL WORKBOOK"}
                  </span>
                  <h3>{store.title}</h3>
                  <p>{store.description}</p>
                  <div className="sf-phone-buy">
                    <span>
                      {store.price === "Free"
                        ? "Get the free guide"
                        : "Get the download"}
                    </span>
                    <strong>{store.price}</strong>
                  </div>
                </div>
                <div className="sf-phone-extra">
                  <Download size={13} />
                  <span>
                    {i === 0
                      ? "A free resource to get you started"
                      : i === 1
                        ? "Tools for your next big idea"
                        : "Make a little room for yourself"}
                  </span>
                </div>
                <span className="sf-phone-credit">
                  made with <b>sore.</b>
                </span>
                <div className="sf-home-indicator" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <figcaption>
        <span>ILLUSTRATIVE DEMO</span>
      </figcaption>
    </figure>
  );
}
