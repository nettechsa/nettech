import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

export default function Nav() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const onHome = useLocation().pathname === "/";

  return (
    <nav className="nav">
      <div className="w nav-in">
        <Link to="/" className="logo">Nettech</Link>
        <div className="sp" />
        {onHome && (
          <div className="nav-links">
            <a href="#services">Services</a>
            <a href="#process">Process</a>
            <a href="#packages">Packages</a>
            <a href="#faq">FAQ</a>
          </div>
        )}
        {user ? (
          <>
            <Link className="btn s" to="/portal">{user.role === "admin" ? "Dashboard" : "My portal"}</Link>
            <Link className="btn s o" to="/account">Account</Link>
            <button className="btn s o" onClick={() => { logout(); nav("/"); }}>Sign out</button>
          </>
        ) : (
          <>
            <Link className="btn s o" to="/login">Client login</Link>
            <a className="btn s" href={onHome ? "#contact" : "/#contact"}>Get a quote</a>
          </>
        )}
      </div>
    </nav>
  );
}
