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
  onLogout?: () => void;
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

export function Sidebar({ onLogout }: SidebarProps) {
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
        <a className="sidebar-brand" href="#accueil" aria-label="MyFluxperf">
          <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
          <span>
            <strong>My</strong>Fluxperf &bull; Espace client
          </span>
        </a>
        {navLinks}
        {onLogout ? (
          <button className="logout-link" type="button" onClick={onLogout}>
            <LogOut aria-hidden="true" />
            <span>Deconnexion</span>
          </button>
        ) : null}
      </aside>

      <div className={`mobile-drawer ${isOpen ? "is-open" : ""}`} aria-hidden={!isOpen}>
        <div className="mobile-drawer-panel">
          <div className="mobile-drawer-header">
            <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
            <button type="button" aria-label="Fermer la navigation" onClick={() => setIsOpen(false)}>
              <X aria-hidden="true" />
            </button>
          </div>
          {navLinks}
          {onLogout ? (
            <button className="logout-link" type="button" onClick={onLogout}>
              <LogOut aria-hidden="true" />
              <span>Deconnexion</span>
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
