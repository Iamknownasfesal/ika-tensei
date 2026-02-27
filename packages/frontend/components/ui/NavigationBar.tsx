"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ConnectButton } from "@/components/wallet/ConnectButton";

const NAV_LINKS = [
  { href: "/seal", label: "Seal" },
  { href: "/faucet", label: "Faucet" },
  { href: "/gallery", label: "Gallery" },
  { href: "/guild", label: "Guild" },
  { href: "/profile", label: "Profile" },
];

// Decorative runes for nav
const RUNE_DECORATIONS = ["ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ", "ᚷ", "ᚹ"];

function HamburgerIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <motion.path
        d="M4 6h16"
        stroke="#9ca3af"
        strokeWidth="2"
        strokeLinecap="round"
        animate={{
          rotate: isOpen ? 45 : 0,
          y: isOpen ? 6 : 0,
        }}
        transition={{ duration: 0.2 }}
      />
      {isOpen ? (
        <motion.path
          d="M4 12h16"
          stroke="#9ca3af"
          strokeWidth="2"
          strokeLinecap="round"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        />
      ) : (
        <motion.path
          d="M4 12h16"
          stroke="#9ca3af"
          strokeWidth="2"
          strokeLinecap="round"
          animate={{ opacity: 1 }}
          transition={{ duration: 0.1 }}
        />
      )}
      <motion.path
        d="M4 18h16"
        stroke="#9ca3af"
        strokeWidth="2"
        strokeLinecap="round"
        animate={{
          rotate: isOpen ? -45 : 0,
          y: isOpen ? -6 : 0,
        }}
        transition={{ duration: 0.2 }}
      />
    </svg>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname?.startsWith(href));

  return (
    <Link
      href={href}
      className={`
        font-silk text-xs transition-all duration-200 relative group
        ${isActive 
          ? "text-ghost-white" 
          : "text-faded-spirit hover:text-ghost-white"
        }
      `}
    >
      {/* Glow effect on active */}
      {isActive && (
        <motion.div
          layoutId="navIndicator"
          className="absolute -bottom-1 left-0 right-0 h-0.5"
          style={{
            background: "linear-gradient(90deg, transparent, #ff3366, transparent)",
            boxShadow: "0 0 10px #ff6b9d, 0 0 20px #ff6b9d80",
          }}
        />
      )}
      {/* Rune appears on hover */}
      <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-ritual-gold" style={{ textShadow: "0 0 8px #ffd700" }}>
        {RUNE_DECORATIONS[Math.floor(Math.random() * RUNE_DECORATIONS.length)]}
      </span>
      {label}
    </Link>
  );
}

function MobileNavLink({
  href,
  label,
  onClick,
}: {
  href: string;
  label: string;
  onClick: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname?.startsWith(href));

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`
        block w-full py-3 px-6 font-silk text-sm border-b border-sigil-border/50 transition-all
        ${isActive 
          ? "text-ghost-white bg-blood-pink/10" 
          : "text-faded-spirit hover:text-ghost-white hover:bg-sigil-border/20"
        }
      `}
    >
      {label}
    </Link>
  );
}


export function NavigationBar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Handle scroll for background opacity
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <>
      {/* Desktop & Mobile Top Bar */}
      <motion.nav
        className="fixed top-0 left-0 right-0 z-50 border-b-2 border-sigil-border py-3 px-4"
        animate={{
          backgroundColor: isScrolled ? "rgba(15, 15, 35, 0.85)" : "rgba(15, 15, 35, 0.95)",
          backdropFilter: isScrolled ? "blur(12px)" : "blur(8px)",
          paddingTop: isScrolled ? "0.5rem" : "0.75rem",
          paddingBottom: isScrolled ? "0.5rem" : "0.75rem",
        }}
        transition={{ duration: 0.3 }}
      >
        {/* Decorative top runes - only show when not scrolled */}
        <AnimatePresence>
          {!isScrolled && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute top-full left-0 right-0 flex justify-center gap-4 pointer-events-none"
            >
              {RUNE_DECORATIONS.map((rune, i) => (
                <motion.span
                  key={i}
                  className="text-[8px] text-sigil-border"
                  animate={{
                    opacity: [0.3, 0.6, 0.3],
                  }}
                  transition={{
                    duration: 3,
                    delay: i * 0.3,
                    repeat: Infinity,
                  }}
                >
                  {rune}
                </motion.span>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Left: Logo */}
          <Link href="/" className="flex items-center gap-2">
            <motion.div
              whileHover={{ y: -2 }}
              transition={{ type: "spring", stiffness: 400, damping: 17 }}
            >
              <Image src="/art/ika-mascot-v2.png" alt="Ika" width={24} height={24} className="pixelated" />
            </motion.div>
            <span className="font-pixel text-blood-pink text-sm">イカ転生</span>
          </Link>

          {/* Center: Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-6">
            {NAV_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} />
            ))}
          </div>

          {/* Right: Connect Button (Desktop) + Hamburger (Mobile) */}
          <div className="hidden md:flex items-center gap-3">
            <ConnectButton />
          </div>
          <button
            className="md:hidden p-2 relative"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open menu"
          >
            <HamburgerIcon isOpen={false} />
            {/* Small rune decoration */}
            <motion.span
              className="absolute -top-1 -right-1 text-[8px] text-blood-pink"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              ⚡
            </motion.span>
          </button>
        </div>
      </motion.nav>

      {/* Mobile Menu - Occult-themed slide panel */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
              onClick={closeMobileMenu}
            />

            {/* Slide-down Panel with occult styling */}
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed top-[57px] left-0 right-0 z-50 md:hidden bg-ritual-dark border-b border-sigil-border"
            >
              {/* Decorative border with runes */}
              <div className="flex justify-center py-2 border-b border-sigil-border/30">
                {RUNE_DECORATIONS.slice(0, 4).map((rune, i) => (
                  <span key={i} className="text-[10px] text-blood-pink/50 mx-1">{rune}</span>
                ))}
              </div>

              {/* Mobile Nav Links */}
              <div className="py-2">
                {NAV_LINKS.map((link) => (
                  <MobileNavLink
                    key={link.href}
                    href={link.href}
                    label={link.label}
                    onClick={closeMobileMenu}
                  />
                ))}
              </div>

              {/* Connect Button (Mobile) */}
              <div className="p-6 border-t border-sigil-border">
                <ConnectButton />
              </div>

              {/* Decorative footer */}
              <div className="flex justify-center pb-4">
                {RUNE_DECORATIONS.slice(4).map((rune, i) => (
                  <span key={i} className="text-[10px] text-blood-pink/50 mx-1">{rune}</span>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
