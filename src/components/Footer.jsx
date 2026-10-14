import { COMPANY } from "../content";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="w">© {new Date().getFullYear()} {COMPANY.name}. Web development services. {COMPANY.email}</div>
    </footer>
  );
}
