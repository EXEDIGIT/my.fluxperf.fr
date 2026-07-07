import {
  BarChart3,
  FilePenLine,
  FolderOpen,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  X
} from "lucide-react";
import { useState } from "react";

type SidebarProps = {
  logoutUrl?: string;
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
    label: "Mes rapports",
    href: "#rapports",
    icon: BarChart3
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

export function Sidebar({ logoutUrl }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = (
    <nav className="sidebar-nav" aria-label="Navigation principale">
      {navigation.map((item) => {
        const Icon = item.icon;

        return (
          <a key={item.href} href={item.href} onClick={() => setIsOpen(false)}>
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
        <a className="sidebar-brand" href="#accueil" aria-label="My FluxPerf">
          <img src="/assets/img/logo-fluxperf.svg" alt="FluxPerf" />
          <span>My FluxPerf</span>
        </a>
        {navLinks}
        {logoutUrl ? (
          <a className="logout-link" href={logoutUrl}>
            <LogOut aria-hidden="true" />
            <span>Déconnexion</span>
          </a>
        ) : null}
      </aside>

      <div className={`mobile-drawer ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
        <div className="mobile-drawer-panel">
          <div className="mobile-drawer-header">
            <img src="/assets/img/logo-fluxperf.svg" alt="FluxPerf" />
            <button type="button" aria-label="Fermer la navigation" onClick={() => setIsOpen(false)}>
              <X aria-hidden="true" />
            </button>
          </div>
          {navLinks}
          {logoutUrl ? (
            <a className="logout-link" href={logoutUrl}>
              <LogOut aria-hidden="true" />
              <span>Déconnexion</span>
            </a>
          ) : null}
        </div>
      </div>
    </>
  );
}

