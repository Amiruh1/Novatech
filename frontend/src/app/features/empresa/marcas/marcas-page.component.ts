import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarcasService, MarcaModel } from '../../../services/marcas.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

@Component({
  selector: 'app-marcas-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    TableModule,
    ToggleSwitchModule,
    TagModule,
    TooltipModule,
    ConfirmDialogModule
  ],
  templateUrl: './marcas-page.component.html',
  styleUrl: './marcas-page.component.scss'
})
export class MarcasPage implements OnInit {
  private marcasSrv      = inject(MarcasService);
  private messageService = inject(MessageService);
  private confirmSvc     = inject(ConfirmationService);
  private cd             = inject(ChangeDetectorRef);

  marcas: MarcaModel[] = [];
  loading   = true;
  guardando = false;

  mostrarDialog = false;
  marcaActual: Partial<MarcaModel> = {};

  ngOnInit() {
    this.cargar();
  }

  cargar() {
    this.loading = true;
    this.marcasSrv.getMarcas().subscribe({
      next: (res) => { this.marcas = res; this.loading = false; this.cd.detectChanges(); },
      error: () => { this.loading = false; this.cd.detectChanges(); }
    });
  }

  abrirDialog(marca?: MarcaModel) {
    this.marcaActual = marca ? { ...marca } : { nombre: '', activo: true };
    this.mostrarDialog = true;
  }

  guardar() {
    if (!this.marcaActual.nombre?.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Atención', detail: 'El nombre es obligatorio' });
      return;
    }
    this.guardando = true;
    const payload = { nombre: this.marcaActual.nombre!.trim(), activo: this.marcaActual.activo ? 1 : 0 };

    const req$ = this.marcaActual.id
      ? this.marcasSrv.updateMarca(this.marcaActual.id, payload)
      : this.marcasSrv.createMarca(payload);

    req$.subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Éxito', detail: this.marcaActual.id ? 'Marca actualizada' : 'Marca creada' });
        this.guardando = false;
        this.mostrarDialog = false;
        this.cargar();
      },
      error: (e: any) => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'Error al guardar' });
        this.guardando = false;
      }
    });
  }

  eliminar(marca: MarcaModel) {
    this.confirmSvc.confirm({
      header: 'Confirmar eliminación',
      message: `¿Eliminar la marca "${marca.nombre}"? Verifica que no tenga productos asociados.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.marcasSrv.deleteMarca(marca.id!).subscribe({
          next: () => { this.messageService.add({ severity: 'success', summary: 'Eliminada' }); this.cargar(); },
          error: (e: any) => this.messageService.add({ severity: 'error', summary: 'Error', detail: e?.error?.message || 'No se pudo eliminar' })
        });
      }
    });
  }
}
