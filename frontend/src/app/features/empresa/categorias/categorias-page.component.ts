import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CategoriasService, CategoriaModel } from '../../../services/categorias';
import { AuthService } from '../../../services/auth';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

@Component({
  selector: 'app-categorias-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    TableModule,
    CheckboxModule,
    TagModule,
    TooltipModule,
    ConfirmDialogModule
  ],
  templateUrl: './categorias-page.component.html',
  styleUrl: './categorias-page.component.scss'
})
export class CategoriasPage implements OnInit {
  private categoriasSrv = inject(CategoriasService);
  private auth = inject(AuthService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private cd = inject(ChangeDetectorRef);

  categorias: CategoriaModel[] = [];
  loading: boolean = true;
  guardando: boolean = false;

  mostrarDialog: boolean = false;
  catActual: Partial<CategoriaModel> = {};

  ngOnInit(): void {
    this.cargarCategorias();
  }

  cargarCategorias() {
    this.loading = true;
    this.categoriasSrv.getCategorias().subscribe({
      next: (res: CategoriaModel[]) => {
        this.categorias = res;
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (e: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las categorías' });
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  abrirDialog(cat?: CategoriaModel) {
    if (cat) {
      this.catActual = { ...cat };
    } else {
      let maxOrden = 0;
      if (this.categorias && this.categorias.length > 0) {
        maxOrden = Math.max(...this.categorias.map(c => c.orden || 0));
      }
      this.catActual = { nombre: '', slug: '', activo: true, orden: maxOrden + 1 };
    }
    this.mostrarDialog = true;
  }

  guardar() {
    if (!this.catActual.nombre) {
      this.messageService.add({ severity: 'warn', summary: 'Cuidado', detail: 'El nombre es obligatorio' });
      return;
    }

    this.guardando = true;
    this.catActual.activo = this.catActual.activo ? 1 : 0;

    if (this.catActual.id) {
      this.categoriasSrv.updateCategoria(this.catActual.id, this.catActual).subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Categoría actualizada' });
          this.guardando = false;
          this.mostrarDialog = false;
          this.cargarCategorias();
        },
        error: (e: any) => {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Error al actualizar' });
          this.guardando = false;
        }
      });
    } else {
      this.categoriasSrv.createCategoria(this.catActual).subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Éxito', detail: 'Categoría creada' });
          this.guardando = false;
          this.mostrarDialog = false;
          this.cargarCategorias();
        },
        error: (e: any) => {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Error al crear' });
          this.guardando = false;
        }
      });
    }
  }

  eliminar(id: number) {
    this.confirmationService.confirm({
      message: '¿Estás seguro de eliminar esta categoría? Esto podría afectar a los productos asociados si dependian de ella.',
      header: 'Confirmar Eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.categoriasSrv.deleteCategoria(id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Eliminada', detail: 'Categoría eliminada con éxito' });
            this.cargarCategorias();
          },
          error: (e: any) => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar. Verifique que no tenga productos asociados.' });
          }
        });
      }
    });
  }
}
