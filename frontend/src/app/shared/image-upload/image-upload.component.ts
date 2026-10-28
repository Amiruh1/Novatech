import { Component, DestroyRef, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { MediaService } from '../../services/media';

let nextInputId = 0;

@Component({
  selector: 'app-image-upload',
  standalone: true,
  template: `
    <div class="image-upload">
      <label [for]="inputId">Subir imagen desde el equipo</label>
      <input [id]="inputId" type="file" accept="image/jpeg,image/png,image/webp"
        [disabled]="disabled || uploading()" (change)="selectFile($event)" />
      <small>JPEG, PNG o WebP. Máximo 5 MB.</small>
      @if (uploading()) { <small role="status">Subiendo imagen...</small> }
      @if (error()) { <small class="upload-error" role="alert">{{ error() }}</small> }
      @if (completed()) { <small role="status">Imagen subida. Guarda los cambios para usarla.</small> }
    </div>
  `,
  styles: [`
    .image-upload { display: grid; gap: .4rem; margin-top: .7rem; }
    label { font-weight: 600; }
    input { width: 100%; min-width: 0; font: inherit; }
    small { color: var(--p-text-muted-color, #64748b); }
    .upload-error { color: var(--p-red-600, #dc2626); }
  `],
})
export class ImageUploadComponent {
  @Input() disabled = false;
  @Output() uploaded = new EventEmitter<string>();
  @Output() busyChange = new EventEmitter<boolean>();
  readonly inputId = `image-upload-${++nextInputId}`;
  readonly uploading = signal(false);
  readonly completed = signal(false);
  readonly error = signal('');
  private media = inject(MediaService);
  private destroyRef = inject(DestroyRef);

  selectFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.error.set('');
    this.completed.set(false);
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size === 0 || file.size > 5 * 1024 * 1024) {
      this.error.set('Elige una imagen JPEG, PNG o WebP de hasta 5 MB.');
      return;
    }
    this.uploading.set(true);
    this.busyChange.emit(true);
    this.media.upload(file).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => {
      this.uploading.set(false);
      this.busyChange.emit(false);
    })).subscribe({
      next: ({ url }) => { this.uploaded.emit(url); this.completed.set(true); },
      error: (error) => this.error.set(error.error?.message || 'No se pudo subir la imagen. Inténtalo de nuevo.'),
    });
  }
}
