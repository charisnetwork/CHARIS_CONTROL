import { create } from 'zustand';

export interface Product {
  id: string;
  productName: string;
  displayName: string;
  logo?: string;
  apiBaseUrl: string;
  environment: 'development' | 'staging' | 'production';
  status: 'active' | 'disabled' | 'archived';
  version: number | string;
  frontendUrl?: string;
  healthPath: string;
  description?: string;
  customerApi?: string;
  subscriptionApi?: string;
  couponApi?: string;
  notificationApi?: string;
  healthApi?: string;
  authenticationMethod?: string;
}

interface ProductState {
  products: Product[];
  selectedProduct: Product | null;
  isAllApplications: false;
  setProducts: (products: Product[]) => void;
  selectProduct: (productId: string | null) => void;
  clearProducts: () => void;
}

export const useProductStore = create<ProductState>((set) => ({
  products: [],
  selectedProduct: null,
  isAllApplications: false,
  setProducts: (products) =>
    set((state) => ({
      products,
      selectedProduct: state.selectedProduct
        ? products.find((product) => product.id === state.selectedProduct?.id) ?? null
        : null,
    })),
  selectProduct: (productId) =>
    set((state) => ({
      selectedProduct: productId
        ? state.products.find((product) => product.id === productId) ?? null
        : null,
    })),
  clearProducts: () => set({ products: [], selectedProduct: null }),
}));
