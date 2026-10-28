import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormsModule, ReactiveFormsModule, FormBuilder, Validators, ValidationErrors } from '@angular/forms';

// Cross-field validator: precio_oferta debe ser menor que precio
function ofertaMenorQuePrecio(group: AbstractControl): ValidationErrors | null {
  const precio  = Number(group.get('precio')?.value  ?? 0);
  const oferta  = group.get('precio_oferta')?.value;
  if (oferta !== null && oferta !== undefined && oferta !== '' && Number(oferta) >= precio && precio > 0) {
    return { ofertaMayorQuePrecio: true };
  }
  return null;
}

// Cross-field validator: no restar más stock del que existe
function stockDeduccionValida(group: AbstractControl): ValidationErrors | null {
  const op       = group.get('operacion')?.value;
  const cantidad = Number(group.get('cantidad')?.value ?? 0);
  const actual   = Number(group.get('stockActual')?.value ?? 0);
  if (op === 'restar' && cantidad > actual) {
    return { stockInsuficiente: true };
  }
  return null;
}
import { ProductsService } from '../../../services/products';
import { AuthService } from '../../../services/auth';
import { ConfirmationService, MessageService } from 'primeng/api';
import { finalize } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TagModule } from 'primeng/tag';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';
import { BannersService, BannerModel } from '../../../services/banners';
import { ProductModel } from '../../../core/models/product.model';
import { OptionWithIcon, ProductView } from './productos.types';
import { ListaProductos } from './lista-productos/lista-productos.component';
import { CrearProducto } from './crear-producto/crear-producto.component';
import { EditarProducto } from './editar-producto/editar-producto.component';
import { AjustarStock } from './ajustar-stock/ajustar-stock.component';
import { MovimientosStock } from './movimientos-stock/movimientos-stock.component';
import { ImageUploadComponent } from '../../../shared/image-upload/image-upload.component';

@Component({
  selector: 'app-producto-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CardModule,
    SelectModule,
    ConfirmDialogModule,
    ListaProductos,
    CrearProducto,
    EditarProducto,
    AjustarStock,
    MovimientosStock,
    TagModule,
    CheckboxModule,
    DialogModule,
    InputTextModule,
    TooltipModule,
    ImageUploadComponent
  ],
  templateUrl: './producto-page.component.html',
  styleUrl: './producto-page.component.scss'
})
export class ProductoPage implements OnInit {
  readonly PERMISOS = {
    CREAR_PRODUCTO: 'CREAR_PRODUCTO',
    EDITAR_PRODUCTO: 'EDITAR_PRODUCTO',
    ELIMINAR_PRODUCTO: 'ELIMINAR_PRODUCTO',
    AJUSTAR_STOCK_MANUAL: 'AJUSTAR_STOCK_MANUAL'
  };

  products: ProductView[] = [];
  loading: boolean = true;
  visibleCrear: boolean = false;
  visibleEditar: boolean = false;
  visibleStock: boolean = false;
  visibleMovimientos: boolean = false;
  currentProductId: number | null = null;
  currentProductName: string = '';
  guardandoProducto: boolean = false;
  isAdmin: boolean = false;

  banners: BannerModel[] = [];
  loadingBanners = false;
  mostrarBannerDialog = false;
  bannerActual: Partial<BannerModel> = {};
  guardandoBanner = false;
  subiendoBanner = false;

  categoryOptions: OptionWithIcon[] = [];
  brandOptions: OptionWithIcon[] = [];
  categoryFilter: string | null = null;
  searchText: string = '';
  globalFilterFields = ['sku', 'nombre', 'descripcion', 'categoria', 'marca'];

  private fb = inject(FormBuilder);

  productForm = this.fb.group({
    nombre:        ['', [Validators.required, Validators.maxLength(100)]],
    descripcion:   ['', [Validators.maxLength(255)]],
    precio:        [0, [Validators.required, Validators.min(0.01), Validators.max(99999999.99)]],
    precio_compra: [null as number | null, [Validators.min(0), Validators.max(99999999.99)]],
    precio_oferta: [null as number | null, [Validators.min(0), Validators.max(99999999.99)]],
    stock:         [0,  [Validators.min(0), Validators.max(2147483647)]],
    categoria:     ['', [Validators.maxLength(50)]],
    subcategoria:  ['', [Validators.maxLength(50)]],
    marca:         ['', [Validators.maxLength(50)]],
    sku:           ['', [Validators.maxLength(30)]],
    imagen:        ['', [Validators.maxLength(500)]]
  }, { validators: [ofertaMenorQuePrecio] });

  stockForm = this.fb.group({
    stockActual: [0],
    operacion:   ['sumar'],
    cantidad:    [0,  [Validators.required, Validators.min(1), Validators.max(2147483647)]],
    motivo:      ['', [Validators.required, Validators.minLength(10), Validators.maxLength(255)]]
  }, { validators: [stockDeduccionValida] });

  private productsService = inject(ProductsService);
  private bannersSrv = inject(BannersService);
  private authService = inject(AuthService);
  private cd = inject(ChangeDetectorRef);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);

  ngOnInit() {
    this.isAdmin = this.authService.currentUserValue?.rol === 'admin';
    this.cargarProductos();
    this.cargarCatalogoCategorias();
    
    if (this.isAdmin) {
      this.cargarBanners();
    }
  }

  get productsView(): ProductView[] {
    let data = [...this.products];

    if (this.categoryFilter) {
      data = data.filter(product => product.categoria === this.categoryFilter);
    }

    const query = (this.searchText || '').trim().toLowerCase();
    if (!query) {
      return data;
    }

    return data.filter(product => {
      const bag = `${product.sku || ''} ${product.nombre || ''} ${product.descripcion || ''} ${product.categoria || ''} ${product.marca || ''}`.toLowerCase();
      return bag.includes(query);
    });
  }

  get totalProductosVista() {
    return this.productsView.length;
  }

  get totalStockVista() {
    return this.productsView.reduce((acc, product) => acc + Number(product.stock || 0), 0);
  }

  get productosSinStock() {
    return this.productsView.filter(product => Number(product.stock || 0) === 0).length;
  }

  get valorInventarioVista() {
    return this.productsView.reduce((acc, product) => {
      const precio = Number(product.precio || 0);
      const stock = Number(product.stock || 0);
      return acc + (precio * stock);
    }, 0);
  }

  get nombreControl() {
    return this.productForm.controls.nombre;
  }

  get precioControl() {
    return this.productForm.controls.precio;
  }

  get categoriaControl() {
    return this.productForm.controls.categoria;
  }

  get subcategoriaControl() {
    return this.productForm.controls.subcategoria;
  }

  get precioOfertaControl() {
    return this.productForm.controls.precio_oferta;
  }

  get ofertaError(): boolean {
    return !!this.productForm.errors?.['ofertaMayorQuePrecio'] &&
           !!this.productForm.get('precio_oferta')?.value;
  }

  get stockInsuficienteError(): boolean {
    return !!this.stockForm.errors?.['stockInsuficiente'];
  }

  tienePermiso(permiso: string) {
    if (this.isAdmin) {
      return true;
    }

    const permisosRestringidos = new Set([
      this.PERMISOS.CREAR_PRODUCTO,
      this.PERMISOS.ELIMINAR_PRODUCTO,
      this.PERMISOS.AJUSTAR_STOCK_MANUAL
    ]);

    return !permisosRestringidos.has(permiso);
  }

  cargarProductos() {
    this.loading = true;
    this.productsService.getProducts().subscribe({
      next: (data) => {
        this.products = data.map((product, index) => this.normalizeProduct(product, index));
        this.buildCategoryOptions();
        this.buildBrandOptions();
        this.loading = false;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error(err);
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  abrirDialogoCrear() {
    if (!this.tienePermiso(this.PERMISOS.CREAR_PRODUCTO)) {
      return;
    }

    this.setFormularioProductoBloqueado(false);
    this.currentProductId = null;
    this.currentProductName = '';
    this.visibleEditar = false;
    this.visibleStock = false;
    this.visibleMovimientos = false;
    const categoriaDefault = this.categoryOptions[0]?.value || 'General';
    const marcaDefault = this.brandOptions[0]?.value || 'NovaTech';

    this.productForm.reset({
      nombre: '',
      descripcion: '',
      precio: 0,
      precio_compra: null,
      precio_oferta: null,
      stock: 0,
      categoria: categoriaDefault,
      subcategoria: '',
      marca: marcaDefault,
      sku: this.generateNextSku(),
      imagen: ''
    });
    this.visibleCrear = true;
  }

  abrirDialogoEditar(prod: ProductView) {
    if (!this.tienePermiso(this.PERMISOS.EDITAR_PRODUCTO)) {
      return;
    }

    this.setFormularioProductoBloqueado(false);
    this.currentProductId = prod.id;
    this.currentProductName = prod.nombre;
    this.visibleCrear = false;
    this.visibleStock = false;
    this.visibleMovimientos = false;
    this.productForm.reset({
      ...prod,
      precio_compra: prod.precio_compra ?? null,
      precio_oferta: prod.precio_oferta || null,
      categoria: prod.categoria || this.categoryOptions[0]?.value || 'General',
      subcategoria: prod.subcategoria || '',
      marca: prod.marca || this.brandOptions[0]?.value || 'NovaTech',
      sku: prod.sku || this.generateSkuById(prod.id)
    });
    this.visibleEditar = true;
  }

  cerrarDialogoCrear() {
    this.visibleCrear = false;
  }

  cerrarDialogoEditar() {
    this.visibleEditar = false;
  }

  cerrarDialogoStock() {
    this.visibleStock = false;
  }

  guardarCreacionProducto() {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'Formulario invalido',
        detail: 'Revisa nombre, precio y longitudes de campos'
      });
      return;
    }

    const formValue = this.productForm.getRawValue();
    const precio = this.toNonNegativePrice(formValue.precio);
    const stock = this.toNonNegativeInteger(formValue.stock);

    if (precio === null || stock === null) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Valores invalidos',
        detail: 'Precio y stock deben ser numericos, sin negativos y dentro de rango.'
      });
      return;
    }

    this.guardandoProducto = true;
    this.setFormularioProductoBloqueado(true);

    const payload: Partial<ProductModel> = {
      ...formValue,
      nombre: formValue.nombre || '',
      descripcion: formValue.descripcion || '',
      precio,
      precio_compra: this.toNonNegativePrice(formValue.precio_compra),
      precio_oferta: this.toNonNegativePrice(formValue.precio_oferta),
      stock,
      categoria: formValue.categoria || this.categoryOptions[0]?.value || 'General',
      subcategoria: formValue.subcategoria || '',
      marca: formValue.marca || this.brandOptions[0]?.value || 'NovaTech',
      sku: formValue.sku || this.generateNextSku(),
      imagen: formValue.imagen || ''
    };

    this.productsService.createProduct(payload)
      .pipe(
        finalize(() => {
          this.guardandoProducto = false;
          this.setFormularioProductoBloqueado(false);
        })
      )
      .subscribe({
      next: () => {
        this.messageService.add({severity:'success', summary:'Creado', detail:'Producto nuevo agregado'});
        this.visibleCrear = false;
        this.cargarProductos();
      },
      error: (err) => this.messageService.add({severity:'error', summary:'Error', detail: err.message})
    });
  }

  guardarEdicionProducto() {
    if (this.productForm.invalid || !this.currentProductId) {
      this.productForm.markAllAsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'Formulario invalido',
        detail: 'Revisa nombre, precio y longitudes de campos'
      });
      return;
    }

    const formValue = this.productForm.getRawValue();
    const precio = this.toNonNegativePrice(formValue.precio);
    const stock = this.toNonNegativeInteger(formValue.stock);

    if (precio === null || stock === null) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Valores invalidos',
        detail: 'Precio y stock deben ser numericos, sin negativos y dentro de rango.'
      });
      return;
    }

    this.guardandoProducto = true;
    this.setFormularioProductoBloqueado(true);

    const payload: Partial<ProductModel> = {
      ...formValue,
      nombre: formValue.nombre || '',
      descripcion: formValue.descripcion || '',
      precio,
      precio_compra: this.toNonNegativePrice(formValue.precio_compra),
      precio_oferta: this.toNonNegativePrice(formValue.precio_oferta),
      stock,
      categoria: formValue.categoria || this.categoryOptions[0]?.value || 'General',
      subcategoria: formValue.subcategoria || '',
      marca: formValue.marca || this.brandOptions[0]?.value || 'NovaTech',
      sku: formValue.sku || this.generateNextSku(),
      imagen: formValue.imagen || ''
    };

    this.productsService.updateProduct(this.currentProductId, payload)
      .pipe(
        finalize(() => {
          this.guardandoProducto = false;
          this.setFormularioProductoBloqueado(false);
        })
      )
      .subscribe({
      next: () => {
        this.messageService.add({severity:'success', summary:'Actualizado', detail:'Producto modificado'});
        this.visibleEditar = false;
        this.cargarProductos();
      },
      error: (err) => this.messageService.add({severity:'error', summary:'Error', detail: err.message})
    });
  }

  ajustarStockManual(product: ProductView) {
    if (!this.tienePermiso(this.PERMISOS.AJUSTAR_STOCK_MANUAL)) {
      return;
    }

    this.setFormularioStockBloqueado(false);
    this.currentProductId = product.id;
    this.currentProductName = product.nombre;
    this.visibleCrear = false;
    this.visibleEditar = false;
    this.visibleMovimientos = false;
    this.stockForm.reset({
      stockActual: product.stock,
      operacion: 'sumar',
      cantidad: 0,
      motivo: ''
    });

    this.visibleStock = true;
  }

  verMovimientos(product: ProductView) {
    this.currentProductId = product.id;
    this.currentProductName = product.nombre;
    this.visibleMovimientos = true;
  }

  guardarAjusteStock() {
    if (this.stockForm.invalid || !this.currentProductId) {
      this.stockForm.markAllAsTouched();
      this.messageService.add({
        severity: 'warn',
        summary: 'Ajuste invalido',
        detail: 'Revisa operacion, cantidad y motivo (min. 3 letras)'
      });
      return;
    }

    const values = this.stockForm.getRawValue();
    const stockActual = Number(values.stockActual || 0);
    const cantidad = this.toNonNegativeInteger(values.cantidad);
    const operacion = values.operacion || 'sumar';

    if (cantidad === null) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Ajuste invalido',
        detail: 'La cantidad debe ser un numero entero no negativo.'
      });
      return;
    }

    if ((operacion === 'sumar' || operacion === 'restar') && cantidad <= 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Ajuste invalido',
        detail: 'Para sumar o restar, la cantidad debe ser mayor a cero.'
      });
      return;
    }

    let nuevoStock = stockActual;

    if (operacion === 'sumar') {
      nuevoStock = stockActual + cantidad;
    } else if (operacion === 'restar') {
      if (cantidad > stockActual) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Ajuste invalido',
          detail: 'No puedes retirar mas stock del disponible'
        });
        return;
      }

      nuevoStock = stockActual - cantidad;
    } else {
      nuevoStock = cantidad;
    }

    if (nuevoStock < 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Ajuste invalido',
        detail: 'El stock no puede quedar en negativo'
      });
      return;
    }

    this.guardandoProducto = true;
    this.setFormularioStockBloqueado(true);

    const motivo = String(values.motivo || '').trim();

    this.productsService.adjustStock(this.currentProductId, nuevoStock, motivo)
      .pipe(
        finalize(() => {
          this.guardandoProducto = false;
          this.setFormularioStockBloqueado(false);
        })
      )
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Stock actualizado',
            detail: `Nuevo stock: ${nuevoStock} unidades`
          });
          this.visibleStock = false;
          this.cargarProductos();
        },
        error: (err) => this.messageService.add({severity:'error', summary:'Error', detail: err.message})
      });
  }

  private toNonNegativePrice(value: unknown): number | null {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 99999999.99) {
      return null;
    }

    return Number(parsed.toFixed(2));
  }

  private toNonNegativeInteger(value: unknown): number | null {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed) || parsed > 2147483647) {
      return null;
    }

    return parsed;
  }

  private setFormularioProductoBloqueado(bloqueado: boolean) {
    if (bloqueado) {
      this.productForm.disable({ emitEvent: false });
      return;
    }

    this.productForm.enable({ emitEvent: false });
  }

  private setFormularioStockBloqueado(bloqueado: boolean) {
    if (bloqueado) {
      this.stockForm.disable({ emitEvent: false });
      return;
    }

    this.stockForm.enable({ emitEvent: false });
  }

  eliminarProducto(prod: ProductView) {
    if (!this.tienePermiso(this.PERMISOS.ELIMINAR_PRODUCTO)) {
      return;
    }

    this.confirmationService.confirm({
      header: 'Confirmar eliminacion',
      message: `Estas por eliminar el producto "${prod.nombre}". Esta accion no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Si, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-outlined',
      accept: () => {
        this.productsService.deleteProduct(prod.id).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Producto eliminado',
              detail: `${prod.nombre} se elimino correctamente`
            });
            this.cargarProductos();
          },
          error: (err) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err.message })
        });
      }
    });
  }

  private normalizeProduct(product: any, index: number): ProductView {
    return {
      ...product,
      descripcion: product.descripcion || '',
      precio: Number(product.precio || 0),
      precio_compra: product.precio_compra != null ? Number(product.precio_compra) : null,
      precio_oferta: product.precio_oferta ? Number(product.precio_oferta) : null,
      stock: Number(product.stock || 0),
      imagen: product.imagen || '',
      sku: product.sku || this.generateSkuById(product.id || index + 1),
      marca: product.marca || this.detectBrand(product.nombre),
      categoria: product.categoria || 'General',
      subcategoria: product.subcategoria || ''
    };
  }

  private buildCategoryOptions() {
    const iconMap: Record<string, string> = {
      laptops: 'pi pi-desktop',
      monitores: 'pi pi-image',
      accesorios: 'pi pi-headphones',
      smartphones: 'pi pi-mobile',
      gaming: 'pi pi-bolt'
    };

    const categories = new Set(this.products.map(product => product.categoria || 'General'));

    this.categoryOptions = Array.from(categories).map(category => {
      const key = category.toLowerCase();
      return {
        label: category,
        value: category,
        icon: iconMap[key] || 'pi pi-tag'
      };
    });

    if (!this.categoryOptions.length) {
      this.categoryOptions = [{ label: 'General', value: 'General', icon: 'pi pi-tag' }];
    }
  }

  private cargarCatalogoCategorias() {
    this.productsService.getCategories().subscribe({
      next: (categorias) => {
        const existing = new Set(this.categoryOptions.map(option => option.value));

        categorias.forEach(category => {
          if (!existing.has(category)) {
            this.categoryOptions.push({
              label: category,
              value: category,
              icon: 'pi pi-tag'
            });
          }
        });
      },
      error: () => {
      }
    });
  }

  private buildBrandOptions() {
    const brands = new Set(this.products.map(product => product.marca || 'NovaTech'));

    this.brandOptions = Array.from(brands).map(brand => ({
      label: brand,
      value: brand,
      icon: 'pi pi-building'
    }));

    if (!this.brandOptions.length) {
      this.brandOptions = [{ label: 'NovaTech', value: 'NovaTech', icon: 'pi pi-building' }];
    }
  }

  private detectBrand(nombre?: string) {
    const name = (nombre || '').toLowerCase();

    if (name.includes('dell')) return 'Dell';
    if (name.includes('hp')) return 'HP';
    if (name.includes('lenovo')) return 'Lenovo';
    if (name.includes('asus')) return 'Asus';
    if (name.includes('acer')) return 'Acer';

    return 'NovaTech';
  }

  private generateSkuById(id: number) {
    return `SKU-${String(id).padStart(5, '0')}`;
  }

  private generateNextSku() {
    const nextId = (this.products?.length || 0) + 1;
    return this.generateSkuById(nextId);
  }

  cargarBanners() {
    this.loadingBanners = true;
    this.cd.markForCheck();
    this.bannersSrv.getBanners().subscribe({
      next: (res) => {
        this.banners = res;
        this.loadingBanners = false;
        this.cd.markForCheck();
      },
      error: () => {
        this.loadingBanners = false;
        this.cd.markForCheck();
      }
    });
  }

  abrirBannerDialog(banner?: BannerModel) {
    this.bannerActual = banner
      ? { ...banner, activo: Number(banner.activo) === 1 }
      : { imagen: '', titulo: '', subtitulo: '', link: '', activo: true, orden: 0 };
    this.mostrarBannerDialog = true;
    this.cd.markForCheck();
  }

  guardarBanner() {
    if (this.subiendoBanner) return;
    if (!this.bannerActual.imagen?.trim() || !this.bannerActual.titulo?.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Faltan datos', detail: 'La imagen y el título son obligatorios.' });
      return;
    }

    this.guardandoBanner = true;
    this.cd.markForCheck();
    
    const payload = {
      ...this.bannerActual,
      activo: this.bannerActual.activo ? 1 : 0
    };

    const req$ = this.bannerActual.id
      ? this.bannersSrv.updateBanner(this.bannerActual.id, payload)
      : this.bannersSrv.createBanner(payload);

    req$.subscribe({
      next: () => {
        this.mostrarBannerDialog = false;
        this.guardandoBanner = false;
        this.messageService.add({ severity: 'success', summary: 'Banner guardado' });
        this.cargarBanners();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar el banner.' });
        this.guardandoBanner = false;
        this.cd.markForCheck();
      }
    });
  }

  eliminarBanner(id?: number) {
    if (!id) return;
    this.bannersSrv.deleteBanner(id).subscribe(() => {
      this.messageService.add({ severity: 'success', summary: 'Banner eliminado' });
      this.cargarBanners();
    });
  }
}

