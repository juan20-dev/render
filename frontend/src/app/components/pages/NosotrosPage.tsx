import React from 'react';
import { Target, Eye, History, Award, Users, ShieldCheck, Truck, Clock } from 'lucide-react';
import { Button } from '../Button';

interface NosotrosPageProps {
  onNavigateToRegister: () => void;
  onBackToHome: () => void;
  onViewCatalog: () => void;
}

export function NosotrosPage({ onNavigateToRegister, onBackToHome, onViewCatalog }: NosotrosPageProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative h-[400px] bg-primary overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80">
          <img
            src="https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=1200&h=400&fit=crop"
            alt="Grandma's Liqueurs"
            className="w-full h-full object-cover opacity-20"
          />
        </div>

        <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
          <button
            onClick={onBackToHome}
            className="absolute top-6 left-4 sm:left-8 flex items-center gap-2 text-white hover:text-white/80 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Volver</span>
          </button>

          <div className="text-white mt-12">
            <h1 className="text-white mb-4">Nuestra Historia</h1>
            <p className="text-xl text-white/90 max-w-3xl">
              Más de una década compartiendo los mejores licores con Medellín
            </p>
          </div>
        </div>
      </section>

      {/* Historia */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-6">
                <History className="w-5 h-5 text-primary" />
                <span className="text-primary">Desde 2015</span>
              </div>

              <h2 className="text-primary mb-6">Una Tradición Familiar</h2>

              <div className="space-y-4 text-muted-foreground">
                <p>
                  Grandma's Liqueurs nació en 2015 en el corazón de Medellín, inspirada por las recetas
                  tradicionales de nuestra abuela y su pasión por compartir momentos especiales alrededor
                  de una buena bebida.
                </p>
                <p>
                  Lo que comenzó como un pequeño emprendimiento familiar se ha convertido en una empresa
                  con 12 colaboradores comprometidos, distribuyendo licores premium en todo Medellín y
                  sus alrededores desde nuestra sede en Laureles.
                </p>
                <p>
                  Hoy seguimos honrando esa tradición familiar, combinando la calidez del servicio personalizado
                  con la mejor selección de bebidas nacionales e importadas.
                </p>
              </div>
            </div>

            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1569529465841-dfecdab7503b?w=600&h=600&fit=crop"
                alt="Nuestra historia"
                className="rounded-2xl shadow-2xl"
              />
              <div className="absolute -bottom-6 -left-6 bg-primary text-white p-6 rounded-xl shadow-xl">
                <p className="text-4xl mb-1">11+</p>
                <p className="text-white/90">Años de experiencia</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Misión y Visión */}
      <section className="py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Misión */}
            <div className="bg-card rounded-2xl p-8 shadow-lg border-2 border-primary/10">
              <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mb-6">
                <Target className="w-8 h-8 text-white" />
              </div>

              <h3 className="text-primary mb-4">Nuestra Misión</h3>

              <p className="text-muted-foreground leading-relaxed">
                Ofrecer a nuestros clientes la mejor selección de licores premium con un servicio
                excepcional, garantizando productos auténticos, entregas oportunas y asesoría
                personalizada para cada ocasión. Nos comprometemos a ser el aliado de confianza
                para celebraciones, eventos y momentos especiales en Medellín.
              </p>
            </div>

            {/* Visión */}
            <div className="bg-card rounded-2xl p-8 shadow-lg border-2 border-primary/10">
              <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center mb-6">
                <Eye className="w-8 h-8 text-white" />
              </div>

              <h3 className="text-primary mb-4">Nuestra Visión</h3>

              <p className="text-muted-foreground leading-relaxed">
                Ser reconocidos como la licorería líder en Medellín para 2030, expandiendo nuestra
                cobertura a nivel nacional mientras mantenemos la calidez y personalización del servicio
                que nos caracteriza. Aspiramos a ser la primera opción para conocedores de licores
                finos y personas que valoran la calidad y autenticidad.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Por qué elegirnos */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-primary mb-4">¿Por Qué Elegirnos?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Más que una licorería, somos tu aliado para cada celebración
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Calidad Garantizada */}
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Award className="w-10 h-10 text-primary" />
              </div>
              <h4 className="mb-3">Calidad Garantizada</h4>
              <p className="text-sm text-muted-foreground">
                Solo productos auténticos de distribuidores oficiales. Garantía de satisfacción en cada compra.
              </p>
            </div>

            {/* Equipo Experto */}
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-10 h-10 text-primary" />
              </div>
              <h4 className="mb-3">Equipo Experto</h4>
              <p className="text-sm text-muted-foreground">
                12 colaboradores capacitados listos para asesorarte y ayudarte a elegir el licor perfecto.
              </p>
            </div>

            {/* Entregas Rápidas */}
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Truck className="w-10 h-10 text-primary" />
              </div>
              <h4 className="mb-3">Entregas Rápidas</h4>
              <p className="text-sm text-muted-foreground">
                Domicilios ágiles en Medellín. Tu pedido llegará fresco y a tiempo para tu celebración.
              </p>
            </div>

            {/* Atención 24/7 */}
            <div className="text-center">
              <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="w-10 h-10 text-primary" />
              </div>
              <h4 className="mb-3">Disponibilidad</h4>
              <p className="text-sm text-muted-foreground">
                Horarios extendidos y servicio al cliente dedicado. Estamos cuando nos necesitas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Nuestros Valores */}
      <section className="py-16 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-primary mb-4">Nuestros Valores</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Los principios que guían cada decisión que tomamos
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="bg-card p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <h4 className="mb-2">Integridad</h4>
              <p className="text-sm text-muted-foreground">
                Transparencia y honestidad en cada transacción. Precios justos, sin sorpresas.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Award className="w-6 h-6 text-primary" />
              </div>
              <h4 className="mb-2">Excelencia</h4>
              <p className="text-sm text-muted-foreground">
                Búsqueda constante de la calidad superior en productos y servicio al cliente.
              </p>
            </div>

            <div className="bg-card p-6 rounded-xl shadow-md hover:shadow-lg transition-shadow">
              <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h4 className="mb-2">Compromiso</h4>
              <p className="text-sm text-muted-foreground">
                Dedicación total a superar las expectativas de nuestros clientes en cada pedido.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-16 bg-primary text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-white mb-4">Únete a la Familia Grandma's</h2>
          <p className="text-xl text-white/90 mb-8">
            Descubre por qué miles de personas en Medellín confían en nosotros para sus celebraciones
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={onNavigateToRegister}
              size="lg"
              className="bg-white text-primary hover:bg-white/90"
            >
              Crear mi Cuenta
            </Button>
            <Button
              onClick={onViewCatalog}
              size="lg"
              variant="outline"
              className="border-white text-white hover:bg-white/10"
            >
              Ver Catálogo
            </Button>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-8 pt-8 border-t border-white/20">
            <div>
              <p className="text-3xl mb-1">12</p>
              <p className="text-white/80 text-sm">Colaboradores</p>
            </div>
            <div>
              <p className="text-3xl mb-1">5000+</p>
              <p className="text-white/80 text-sm">Clientes Satisfechos</p>
            </div>
            <div>
              <p className="text-3xl mb-1">11+</p>
              <p className="text-white/80 text-sm">Años de Experiencia</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
