import Link from "next/link";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.brandColumn}>
          <Link href="/" className={styles.brandLogo}>
            <div className={styles.logoIcon}>A</div>
            <span className={styles.logoText}>AuraAI</span>
          </Link>
          <p className={styles.brandDesc}>
            Creating the next generation of conversational AI design systems and interactive interfaces.
          </p>
        </div>
        
        <div>
          <h4 className={styles.heading}>Product</h4>
          <ul className={styles.list}>
            <li><Link href="#features" className={styles.link}>Features</Link></li>
            <li><Link href="#pricing" className={styles.link}>Pricing</Link></li>
            <li><Link href="#security" className={styles.link}>Security</Link></li>
            <li><Link href="#roadmap" className={styles.link}>Roadmap</Link></li>
          </ul>
        </div>
        
        <div>
          <h4 className={styles.heading}>Resources</h4>
          <ul className={styles.list}>
            <li><Link href="#docs" className={styles.link}>Documentation</Link></li>
            <li><Link href="#guides" className={styles.link}>Guides</Link></li>
            <li><Link href="#api" className={styles.link}>API Reference</Link></li>
            <li><Link href="#status" className={styles.link}>System Status</Link></li>
          </ul>
        </div>
        
        <div>
          <h4 className={styles.heading}>Company</h4>
          <ul className={styles.list}>
            <li><Link href="#about" className={styles.link}>About Us</Link></li>
            <li><Link href="#careers" className={styles.link}>Careers</Link></li>
            <li><Link href="#blog" className={styles.link}>Blog</Link></li>
            <li><Link href="#contact" className={styles.link}>Contact</Link></li>
          </ul>
        </div>
      </div>
      
      <div className={styles.bottom}>
        <p className={styles.copyright}>
          &copy; {new Date().getFullYear()} AuraAI Technologies, Inc. All rights reserved.
        </p>
        <div className={styles.socials}>
          <a href="#" className={styles.socialLink}>Twitter</a>
          <a href="#" className={styles.socialLink}>GitHub</a>
          <a href="#" className={styles.socialLink}>Discord</a>
        </div>
      </div>
    </footer>
  );
}
