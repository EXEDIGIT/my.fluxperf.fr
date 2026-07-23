import {
  FilePenLine,
  FolderOpen,
  LayoutDashboard,
  Layers3,
  LifeBuoy,
  LogOut,
  Menu,
  UserRound,
  TimerReset,
  X
} from "lucide-react";
import { useState, type MouseEvent } from "react";

type SidebarProps = {
  onLogout?: () => void;
  onNavigate?: (href: string) => void;
  ribStatus?: "missing" | "complete";
};

const navigation = [
  {
    label: "Accueil",
    href: "#accueil",
    icon: LayoutDashboard
  },
  {
    label: "Mes demandes",
    href: "#demandes",
    icon: FilePenLine
  },
  {
    label: "Temps libéré",
    href: "#impacts",
    icon: TimerReset
  },
  {
    label: "Services actifs",
    href: "#services-actifs",
    icon: Layers3
  },
  {
    label: "Ressources",
    href: "#ressources",
    icon: FolderOpen
  },
  {
    label: "Support",
    href: "#support",
    icon: LifeBuoy
  },
  {
    label: "Mon compte",
    href: "#mon-compte",
    icon: UserRound
  }
];

export function Sidebar({ onLogout, onNavigate, ribStatus = "missing" }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  function handleNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    setIsOpen(false);

    if (onNavigate) {
      event.preventDefault();
      onNavigate(href);
    }
  }

  const navLinks = (
    <nav className="sidebar-nav" aria-label="Navigation principale">
      {navigation.map((item) => {
        const Icon = item.icon;

        return (
          <a key={item.href} href={item.href} onClick={(event) => handleNavigation(event, item.href)}>
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
            {item.href === "#mon-compte" && ribStatus === "missing" ? (
              <span className="sidebar-attention" role="img" aria-label="RIB à compléter" />
            ) : null}
          </a>
        );
      })}
    </nav>
  );

  return (
    <>
      <button
        className="mobile-menu-button"
        type="button"
        aria-label="Ouvrir la navigation"
        onClick={() => setIsOpen(true)}
      >
        <Menu aria-hidden="true" />
      </button>

      <aside className="sidebar desktop-sidebar">
        <a
          className="sidebar-brand"
          href="#accueil"
          aria-label="MyFluxperf"
          onClick={(event) => handleNavigation(event, "#accueil")}
        >
          <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
          <span>
            <strong>My</strong>Fluxperf &bull; Espace client
          </span>
        </a>
        {navLinks}
        {onLogout ? (
          <button className="logout-link" type="button" onClick={onLogout}>
            <LogOut aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        ) : null}
      </aside>

      <div className={`mobile-drawer ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
        <div className="mobile-drawer-panel">
          <div className="mobile-drawer-header">
            <a href="#accueil" aria-label="MyFluxperf" onClick={(event) => handleNavigation(event, "#accueil")}>
              <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
            </a>
            <button type="button" aria-label="Fermer la navigation" onClick={() => setIsOpen(false)}>
              <X aria-hidden="true" />
            </button>
          </div>
          {navLinks}
          {onLogout ? (
            <button className="logout-link" type="button" onClick={onLogout}>
              <LogOut aria-hidden="true" />
              <span>Déconnexion</span>
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
