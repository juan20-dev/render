import React from 'react';
import { Facebook, Instagram, Mail, MapPin, Phone } from 'lucide-react';
import {
  CONTACTO_CIUDAD,
  CONTACTO_DIRECCION,
  CONTACTO_EMAIL,
  CONTACTO_MAPS_URL,
  CONTACTO_TELEFONO,
  CONTACTO_TELEFONO_DISPLAY,
  LOGO_URL,
} from '../../hooks/landingShared';

interface ContactSectionProps {
  onNavigateToNosotros: () => void;
  onShowAllProducts: () => void;
  onScrollToTop: () => void;
}

export function ContactSection({
  onNavigateToNosotros,
  onShowAllProducts,
  onScrollToTop,
}: ContactSectionProps) {
  return (
    <>
      <section id="contacto" className="py-8 sm:py-12 md:py-16 bg-white">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="text-center mb-8 sm:mb-10 md:mb-12">
            <h2 className="text-primary mb-3 sm:mb-4 text-xl sm:text-2xl md:text-3xl">
              Contáctanos
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base px-4">
              ¿Tienes alguna pregunta? Estamos aquí para ayudarte
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="space-y-6 mb-12">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center text-center p-6 bg-background rounded-lg hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <MapPin className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="mb-2">Dirección</h4>
                  <a
                    href={CONTACTO_MAPS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {CONTACTO_DIRECCION}
                    <br />
                    {CONTACTO_CIUDAD}
                    <br />
                    Antioquia, Colombia
                  </a>
                </div>

                <div className="flex flex-col items-center text-center p-6 bg-background rounded-lg hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <Phone className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="mb-2">Teléfono</h4>
                  <p className="text-sm text-muted-foreground">
                    <a
                      href={`tel:+57${CONTACTO_TELEFONO}`}
                      className="hover:text-primary transition-colors"
                    >
                      {CONTACTO_TELEFONO_DISPLAY}
                    </a>
                    <br />
                    Lunes a Sábado: 9:00 AM - 8:00 PM
                    <br />
                    Domingos: 10:00 AM - 6:00 PM
                  </p>
                </div>

                <div className="flex flex-col items-center text-center p-6 bg-background rounded-lg hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                    <Mail className="w-8 h-8 text-primary" />
                  </div>
                  <h4 className="mb-2">Email</h4>
                  <p className="text-sm text-muted-foreground">
                    <a
                      href={`mailto:${CONTACTO_EMAIL}`}
                      className="hover:text-primary transition-colors"
                    >
                      {CONTACTO_EMAIL}
                    </a>
                    <br />
                    ventas@grandmasliqueurs.com
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <h4 className="mb-6">Síguenos en Redes Sociales</h4>
              <div className="flex gap-4 justify-center">
                <a
                  href="#"
                  className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-colors text-white shadow-lg hover:shadow-xl"
                >
                  <Facebook className="w-6 h-6" />
                </a>
                <a
                  href="#"
                  className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-colors text-white shadow-lg hover:shadow-xl"
                >
                  <Instagram className="w-6 h-6" />
                </a>
                <a
                  href="#"
                  className="w-14 h-14 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-colors text-white shadow-lg hover:shadow-xl"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-primary text-white pt-8 sm:pt-12 md:pt-16 pb-6 sm:pb-8">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 mb-6 sm:mb-8">
            <div className="col-span-1 md:col-span-2">
              <button
                type="button"
                onClick={onScrollToTop}
                className="flex items-center gap-3 mb-4 hover:opacity-90 transition-opacity text-left"
                aria-label="Volver al inicio"
              >
                <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center overflow-hidden">
                  <img
                    src={LOGO_URL}
                    alt="Grandma's Liqueurs Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-white">Grandma&apos;s Liqueurs</h3>
                  <p className="text-sm text-white/80">Licores Premium desde 2015</p>
                </div>
              </button>
              <p className="text-white/80 mb-4">
                Somos una empresa dedicada a la comercialización de licores premium en Medellín.
                Contamos con 12 colaboradores comprometidos con ofrecer productos de la más alta
                calidad y un servicio excepcional.
              </p>
            </div>

            <div>
              <h4 className="text-white mb-4">Enlaces Rápidos</h4>
              <ul className="space-y-2 text-white/80">
                <li>
                  <a href="#inicio" className="hover:text-white transition-colors">
                    Inicio
                  </a>
                </li>
                <li>
                  <a href="#productos" className="hover:text-white transition-colors">
                    Productos
                  </a>
                </li>
                <li>
                  <button onClick={onShowAllProducts} className="hover:text-white transition-colors">
                    Categorías
                  </button>
                </li>
                <li>
                  <button onClick={onNavigateToNosotros} className="hover:text-white transition-colors">
                    Nosotros
                  </button>
                </li>
                <li>
                  <a href="#contacto" className="hover:text-white transition-colors">
                    Contacto
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-white mb-4">Contacto</h4>
              <ul className="space-y-3 text-white/80">
                <li className="flex items-start gap-2">
                  <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <a
                    href={CONTACTO_MAPS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    {CONTACTO_DIRECCION}
                    <br />
                    {CONTACTO_CIUDAD}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-5 h-5 flex-shrink-0" />
                  <a href={`tel:+57${CONTACTO_TELEFONO}`} className="hover:text-white transition-colors">
                    {CONTACTO_TELEFONO_DISPLAY}
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-5 h-5 flex-shrink-0" />
                  <a href={`mailto:${CONTACTO_EMAIL}`} className="hover:text-white transition-colors">
                    {CONTACTO_EMAIL}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/20 pt-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-white/80 text-sm">
                © 2026 Grandma&apos;s Liqueurs. Todos los derechos reservados.
              </p>

              <div className="flex gap-4">
                <a
                  href="#"
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <Facebook className="w-5 h-5" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <Instagram className="w-5 h-5" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
