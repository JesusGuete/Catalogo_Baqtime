import { useState } from "react";
import { iniciarSesion } from "../../../lib/supabase/auth-store";
import { comoAdminError, type AdminError } from "../../../lib/supabase/errors";
import { Boton, Campo, Texto, ErrorAviso } from "./ui";

// Pantalla 01 del diseño. El registro está CERRADO en el servidor (devuelve 422
// signup_disabled), así que acá no hay "crear cuenta" ni "olvidé mi contraseña": los
// admins se dan de alta desde el dashboard de Supabase y se insertan en public.admins.
// Poner un enlace de registro que siempre falla sería mentirle al usuario.

export default function LoginView() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AdminError | null>(null);
  const [enCurso, setEnCurso] = useState(false);

  async function enviar() {
    if (enCurso) return;
    setEnCurso(true);
    setError(null);
    try {
      await iniciarSesion(email, password);
      // No hace falta navegar: AdminApp está suscripto al store de sesión y cambia
      // de vista solo cuando aparece la sesión.
    } catch (err) {
      setError(comoAdminError(err));
      setPassword("");
    } finally {
      setEnCurso(false);
    }
  }

  return (
    <div className="adm-login">
      <aside className="adm-login-editorial">
        <div className="adm-login-marca">
          <img
            src="/assets/img/logo.png"
            alt="Baqtime"
            className="adm-login-logo"
            width="998"
            height="297"
          />
          <p className="adm-mono adm-login-sub">PANEL DE ADMINISTRACIÓN</p>
        </div>

        <div className="adm-login-claim">
          <h1 className="adm-login-titular">
            El catálogo se edita en borrador. El sitio solo cambia cuando publicas los cambios.
          </h1>
          <span className="adm-login-rule" />
        </div>
      </aside>

      <main className="adm-login-form">
        <form
          className="adm-card adm-login-card"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <header className="adm-login-head">
            <p className="adm-mono adm-login-kicker">ACCESO RESTRINGIDO</p>
            <h2 className="adm-login-h2">Iniciar sesión</h2>
          </header>

          <Campo etiqueta="CORREO">
            <Texto value={email} onChange={setEmail} placeholder="admin@baqtime.com" />
          </Campo>

          <Campo etiqueta="CONTRASEÑA">
            <input
              type="password"
              className="adm-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Campo>

          <ErrorAviso error={error} />

          <Boton type="submit" variante="primario" ancho cargando={enCurso}>
            ENTRAR
          </Boton>

          <p className="adm-mono adm-login-nota">EL REGISTRO ESTÁ CERRADO</p>
        </form>
      </main>
    </div>
  );
}
