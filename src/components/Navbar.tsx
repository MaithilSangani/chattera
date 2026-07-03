"use client";

import Link from "next/link";
import styles from "./Navbar.module.css";

export default function Navbar() {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logoContainer}>
        <div className={styles.logoGlow}>A</div>
        <span className={styles.logoText}>AuraAI</span>
      </Link>
      
      <nav className={styles.nav}>
        <Link href="#features" className={styles.navLink}>Features</Link>
        <Link href="#pricing" className={styles.navLink}>Pricing</Link>
        <Link href="#showcase" className={styles.navLink}>Showcase</Link>
        <Link href="#docs" className={styles.navLink}>Docs</Link>
      </nav>
      
      <div className={styles.actions}>
        <button className={styles.btnSecondary}>Sign In</button>
        <button className={styles.btnPrimary}>Launch App</button>
      </div>
    </header>
  );
}
