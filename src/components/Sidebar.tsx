import {
  FilePenLine,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  TimerReset,
  X
} from "lucide-react";
import { useState, type MouseEvent } from "react";

type SidebarProps = {
  onLogout?: () => void;
  onNavigate?: (href: string) => void;
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
    label: "Ressources",
    href: "#ressources",
    icon: FolderOpen
  },
  {
    label: "Support",
    href: "#support",
    icon: LifeBuoy
  }
];

export function Sidebar({ onLogout, onNavigate }: SidebarProps) {
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
