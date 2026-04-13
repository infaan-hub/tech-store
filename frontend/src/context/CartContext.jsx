import { createContext, useContext, useMemo, useState } from "react";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  const addToCart = (product, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [...prev, { product, quantity }];
    });
  };

  const removeFromCart = (productId) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const checkoutSingleProduct = (product, quantity = 1) => {
    setItems([{ product, quantity: Math.max(1, Number(quantity) || 1) }]);
  };

  const updateQuantity = (productId, quantity) => {
    const nextQuantity = Number(quantity);
    setItems((prev) =>
      prev
        .map((item) => (item.product.id === productId ? { ...item, quantity: Math.max(1, nextQuantity) } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const incrementQuantity = (productId) => {
    setItems((prev) =>
      prev.map((item) => (item.product.id === productId ? { ...item, quantity: item.quantity + 1 } : item))
    );
  };

  const decrementQuantity = (productId) => {
    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item
      )
    );
  };

  const clearCart = () => setItems([]);

  const value = useMemo(
    () => ({
      items,
      addToCart,
      removeFromCart,
      checkoutSingleProduct,
      updateQuantity,
      incrementQuantity,
      decrementQuantity,
      clearCart,
      count: items.reduce((total, item) => total + item.quantity, 0),
      total: items.reduce((total, item) => total + Number(item.product.price) * item.quantity, 0),
    }),
    [items]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
