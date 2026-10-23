import { DOCUMENT } from '@angular/common';
import { Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AccessibilityService } from '../core/services/accessibility.service';
import { SpeechService } from '../core/services/speech.service';

@Component({
  selector: 'app-accessibility-toolbar',
  standalone: true,
  imports: [RouterLink],
  host: { '[class.a11y-toolbar-visible]': 'visible()' },
  template: `
    @if (visible()) {
      <section class="a11y-toolbar" aria-label="Ayudas de accesibilidad">
        <div class="a11y-toolbar-heading">
          <strong><span class="a11y-toolbar-icon"><i class="pi pi-sliders-h" aria-hidden="true"></i></span> Tus ayudas</strong>
          <button type="button" (click)="accessibility.openPanel()">Cambiar ayudas</button>
        </div>
        @if (accessibility.preferences().navigation) {
          <nav aria-label="Accesos rápidos de navegación" class="a11y-nav-tools">
            <button type="button" (click)="goToSearch()">Ir al buscador</button>
            <a routerLink="/tienda">Ver productos</a>
            <a routerLink="/carrito">Ir al carrito</a>
          </nav>
          <p><kbd>Tab</kbd> avanza · <kbd>Shift + Tab</kbd> retrocede · <kbd>Enter</kbd> activa botones · <kbd>Escape</kbd> cierra ventanas.</p>
          <p><kbd>↓</kbd> / <kbd>→</kbd> siguiente · <kbd>↑</kbd> / <kbd>←</kbd> anterior. En campos de texto, listas y rangos, usa <kbd>Tab</kbd> para salir.</p>
        }
        <div class="a11y-voice-tools">
          <button #guideButton type="button" (click)="readGuide()"><i class="pi pi-volume-up" aria-hidden="true"></i> Escuchar ayuda de esta página</button>
          @if (speech.enabled()) {
            <button type="button" (click)="stopVoice()">Detener voz</button>
            <span>{{ speech.loadingVoice() ? 'Preparando voz latinoamericana…' : (speech.speaking() ? 'Leyendo…' : 'Voz disponible cuando la solicites') }}</span>
          }
        </div>
        @if (speech.enabled() && !speech.loadingVoice() && speech.voiceName()) {
          <p role="status">Voz: {{ speech.voiceName() }} {{ speech.voiceNotice() }}</p>
        }
        <p role="status">{{ speech.error() || accessibility.storageNotice() }}</p>
      </section>
    }
  `,
  styleUrl: './accessibility-toolbar.scss'
})
export class AccessibilityToolbar {
  readonly accessibility = inject(AccessibilityService);
  readonly speech = inject(SpeechService);
  readonly visible = computed(() => !this.accessibility.panelOpen()
    && (this.accessibility.active() || this.speech.enabled() || !!this.speech.error()));
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly guideButton = viewChild<ElementRef<HTMLButtonElement>>('guideButton');

  stopVoice(): void {
    this.speech.disable();
    requestAnimationFrame(() => {
      const target = this.accessibility.active() ? this.guideButton()?.nativeElement
        : this.document.getElementById('main-content');
      target?.focus();
    });
  }

  async goToSearch(): Promise<void> {
    if (!this.router.url.startsWith('/tienda')) await this.router.navigate(['/tienda']);
    setTimeout(() => {
      const search = this.document.getElementById('catalog-search');
      search?.focus();
      search?.scrollIntoView({ block: 'center', behavior: 'instant' });
    });
  }

  readGuide(): void {
    const path = this.router.url;
    let text = 'Usa Tab para avanzar, Shift más Tab para retroceder y Enter para activar botones. ';
    if (this.accessibility.preferences().navigation) {
      text += 'También puedes recorrer los controles con las flechas: abajo o derecha para avanzar, arriba o izquierda para retroceder. '
        + 'Dentro de campos, listas y rangos, las flechas mantienen su función habitual. Usa Tab para salir de ellos. ';
    }
    if (path.startsWith('/producto/')) {
      text += 'Estás en un producto. Puedes escuchar su información con Escuchar producto, elegir la cantidad y agregarlo al carrito.';
    } else if (path.startsWith('/carrito')) {
      text += 'Estás en el carrito. Revisa tus productos, ajusta cantidades o elimina un artículo. El botón Continuar compra lleva al pedido.';
    } else if (path.startsWith('/checkout')) {
      text += 'Estás completando el pedido. Revisa cada paso. Para elegir una dirección usa las flechas en las opciones. Puedes volver al paso anterior para corregir información. Los errores aparecerán por escrito.';
    } else if (path.startsWith('/tienda')) {
      text += 'Estás en la tienda. Puedes buscar un producto, filtrar por categoría, abrir sus detalles o agregarlo al carrito. Ir al buscador te lleva directamente al campo de búsqueda.';
    } else {
      text += 'Recorre los enlaces y campos de esta página con el teclado. El botón Accesibilidad permite cambiar las ayudas.';
    }
    this.speech.read(text);
  }
}
