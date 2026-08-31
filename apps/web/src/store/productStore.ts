import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Product {
  id: string;
  productName: string;
  displayName: string;
  logo?: string;
  apiBaseUrl: string;
  customerApi?: string;
  subscriptionApi?: string;
  // other fields omitted for brevity
}

interface ProductState {
  products: Product[];
  selectedProduct: Product | null;
  isAllApplications: boolean;
  setProducts: (products: Product[]) => void;
  selectProduct: (productId: string | null) => void;
}

export const useProductStore = create<ProductState>()(
  persist(
    (set) => ({
      products: [],
      selectedProduct: null,
      isAllApplications: true,
      
      setProducts: (products) => set({ products }),
      
      selectProduct: (productId) => set((state) => {
        if (!productId || productId === 'all') {
          return { selectedProduct: null, isAllApplications: true };
        }
        const product = state.products.find(p => p.id === productId) || null;
        return { selectedProduct: product, isAllApplications: false };
      }),
    }),
    {
      name: 'charis-product-storage',
    }
  )
);
