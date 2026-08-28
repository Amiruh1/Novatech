import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type AuthModalView = 'login' | 'register' | 'forgot' | 'forgot-code';
export type AuthModalMode = 'cliente' | 'elevado';

export interface AuthModalState {
  visible: boolean;
  view: AuthModalView;
  mode: AuthModalMode;
  returnUrl: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthModalService {
  private readonly initialState: AuthModalState = {
    visible: false,
    view: 'login',
    mode: 'cliente',
    returnUrl: null
  };

  private readonly stateSubject = new BehaviorSubject<AuthModalState>(this.initialState);
  readonly state$ = this.stateSubject.asObservable();

  get snapshot() {
    return this.stateSubject.value;
  }

  open(options: Partial<Omit<AuthModalState, 'visible'>> = {}) {
    const current = this.stateSubject.value;

    this.stateSubject.next({
      visible: true,
      view: options.view ?? current.view,
      mode: options.mode ?? current.mode,
      returnUrl: options.returnUrl ?? current.returnUrl
    });
  }

  close() {
    this.stateSubject.next(this.initialState);
  }
}
