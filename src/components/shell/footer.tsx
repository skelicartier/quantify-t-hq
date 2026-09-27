const MARKETING_SITE = "https://www.quantifyterminal.com";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <span className="footer__brand">QUANTIFY TERMINAL</span>
        <span className="footer__copy">HQ · Copyright 2026 Quantify Terminal.</span>
        <nav className="footer__links" aria-label="Legal">
          <a href={MARKETING_SITE} rel="noreferrer">
            quantifyterminal.com
          </a>
          <a href={`${MARKETING_SITE}/privacy`} rel="noreferrer">
            Privacy
          </a>
          <a href={`${MARKETING_SITE}/terms`} rel="noreferrer">
            Terms
          </a>
        </nav>
      </div>
    </footer>
  );
}
