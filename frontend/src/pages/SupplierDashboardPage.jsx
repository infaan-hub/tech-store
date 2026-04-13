import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import productPlaceholder from "../assets/product-placeholder.svg";
import { http } from "../api/http.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getApiErrorMessage } from "../lib/apiErrors.js";
import { applyImageFallback, toMediaUrl } from "../lib/media.jsx";

const PRODUCT_PLACEHOLDER = productPlaceholder;

function SupplierDashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    category: "",
    price: "",
    cost_price: "",
    quantity: "",
    barcode: "",
    description: "",
    image: null,
  });
  const [editForm, setEditForm] = useState({
    name: "",
    category: "",
    price: "",
    cost_price: "",
    quantity: "",
    description: "",
    image: null,
  });

  const load = async () => {
    try {
      const response = await http.get("/api/supplier/dashboard/");
      setData(response.data);
    } catch (err) {
      if ([401, 403].includes(err.response?.status)) {
        logout();
        navigate("/supplier/login", { replace: true });
        return;
      }
      setError(getApiErrorMessage(err, "Cannot load supplier dashboard."));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const createProduct = async (event) => {
    event.preventDefault();
    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") payload.append(key, value);
    });
    try {
      await http.post("/api/products/", payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm({
        name: "",
        category: "",
        price: "",
        cost_price: "",
        quantity: "",
        barcode: "",
        description: "",
        image: null,
      });
      await load();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || "Create product failed."));
    }
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setEditForm({
      name: product.name || "",
      category: product.category_name || "",
      price: product.price || "",
      cost_price: product.cost_price || "",
      quantity: product.quantity ?? "",
      description: product.description || "",
      image: null,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({
      name: "",
      category: "",
      price: "",
      cost_price: "",
      quantity: "",
      description: "",
      image: null,
    });
  };

  const updateProduct = async (productId) => {
    const payload = new FormData();
    Object.entries(editForm).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") payload.append(key, value);
    });
    try {
      await http.patch(`/api/products/${productId}/`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      cancelEdit();
      await load();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || "Update product failed."));
    }
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      await http.delete(`/api/products/${productId}/`);
      if (editingId === productId) cancelEdit();
      await load();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || "Delete product failed."));
    }
  };

  return (
    <section className="page-wrap two-col">
      <div className="panel">
        <h2>Supplier Dashboard</h2>
        <p>Products: {data?.products_count ?? 0}</p>
        <p>Low stock: {data?.low_stock_count ?? 0}</p>
        <Link className="primary-btn" to="/supplier/dashboard/scan">
          Open QR/Barcode Scanner
        </Link>
        <Link className="ghost-btn" to="/supplier/calculator">
          Open Calculator
        </Link>
        {error ? <p className="error">{error}</p> : null}
      </div>
      <div className="panel">
        <h2>Add Product</h2>
        <form onSubmit={createProduct}>
          <input name="name" required placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          <input name="category" placeholder="Category" value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
          <input name="price" required placeholder="Price" type="number" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
          <input name="cost_price" required placeholder="Cost Price" type="number" value={form.cost_price} onChange={(e) => setForm((p) => ({ ...p, cost_price: e.target.value }))} />
          <input name="quantity" placeholder="Quantity" type="number" value={form.quantity} onChange={(e) => setForm((p) => ({ ...p, quantity: e.target.value }))} />
          <input name="barcode" required placeholder="Barcode" value={form.barcode} onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))} />
          <textarea name="description" placeholder="Description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          <input name="image" type="file" accept="image/*" onChange={(e) => setForm((p) => ({ ...p, image: e.target.files?.[0] || null }))} />
          <button className="primary-btn" type="submit">Create Product</button>
        </form>
      </div>
      <div className="panel full-span">
        <h2>Your Products</h2>
        <div className="grid-products">
          {data?.products?.map((product) => (
            <article key={product.id} className="product-card small">
              <img
                src={toMediaUrl(product.image_url || product.image) || PRODUCT_PLACEHOLDER}
                alt={product.name}
                data-fallback-src={PRODUCT_PLACEHOLDER}
                onError={applyImageFallback}
              />
              <div className="card-body">
                <h3>{product.name}</h3>
                <p className="price">TZS {product.price}</p>
                <div className="row">
                  <button type="button" className="primary-btn" onClick={() => startEdit(product)}>
                    Edit
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => deleteProduct(product.id)}>
                    Delete
                  </button>
                </div>
                {editingId === product.id ? (
                  <div>
                    <input name="name" value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} placeholder="Name" />
                    <input name="category" value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} placeholder="Category" />
                    <input name="price" type="number" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} placeholder="Price" />
                    <input
                      name="cost_price"
                      type="number"
                      value={editForm.cost_price}
                      onChange={(e) => setEditForm((p) => ({ ...p, cost_price: e.target.value }))}
                      placeholder="Cost Price"
                    />
                    <input
                      name="quantity"
                      type="number"
                      value={editForm.quantity}
                      onChange={(e) => setEditForm((p) => ({ ...p, quantity: e.target.value }))}
                      placeholder="Quantity"
                    />
                    <textarea
                      name="description"
                      value={editForm.description}
                      onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Description"
                    />
                    <input name="image" type="file" accept="image/*" onChange={(e) => setEditForm((p) => ({ ...p, image: e.target.files?.[0] || null }))} />
                    <div className="row">
                      <button type="button" className="primary-btn" onClick={() => updateProduct(product.id)}>
                        Save
                      </button>
                      <button type="button" className="ghost-btn" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default SupplierDashboardPage;
