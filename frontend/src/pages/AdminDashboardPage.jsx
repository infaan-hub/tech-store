import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import productPlaceholder from "../assets/product-placeholder.svg";
import { http } from "../api/http.jsx";
import { applyImageFallback, toMediaUrl } from "../lib/media.jsx";

const PRODUCT_PLACEHOLDER = productPlaceholder;

function AdminDashboardPage() {
  const [payments, setPayments] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [editingProductId, setEditingProductId] = useState(null);
  const [editProductForm, setEditProductForm] = useState({
    name: "",
    category: "",
    price: "",
    quantity: "",
    description: "",
    image: null,
  });
  const [form, setForm] = useState({
    username: "",
    email: "",
    full_name: "",
    phone: "",
    address: "",
    role: "supplier",
    password: "",
    password_confirm: "",
    company_name: "",
    profile_image: null,
  });

  const loadData = async () => {
    try {
      const [paymentRes, userRes, salesRes, productsRes] = await Promise.all([
        http.get("/api/payments/admin_pending/"),
        http.get("/api/users/"),
        http.get("/api/sales/"),
        http.get("/api/products/"),
      ]);
      setPayments(paymentRes.data);
      setDrivers(userRes.data.filter((user) => user.role === "driver"));
      setSales(salesRes.data);
      setProducts(productsRes.data);
    } catch {
      setError("Failed to load admin data.");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createUser = async (event) => {
    event.preventDefault();
    setError("");
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (value !== null && value !== undefined) data.append(key, value);
    });
    try {
      await http.post("/api/auth/admin/create-user/", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setForm({
        username: "",
        email: "",
        full_name: "",
        phone: "",
        address: "",
        role: "supplier",
        password: "",
        password_confirm: "",
        company_name: "",
        profile_image: null,
      });
      await loadData();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || "Cannot create user."));
    }
  };

  const confirmPayment = async (id) => {
    try {
      await http.post(`/api/payments/${id}/confirm/`);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.detail || JSON.stringify(err.response?.data || "Payment confirmation failed."));
    }
  };

  const assignDriver = async (saleId, driverId) => {
    if (!driverId) return;
    try {
      await http.post(`/api/sales/${saleId}/assign_driver/`, { driver_id: Number(driverId) });
      await loadData();
    } catch {
      setError("Assign driver failed.");
    }
  };

  const startEditProduct = (product) => {
    setEditingProductId(product.id);
    setEditProductForm({
      name: product.name || "",
      category: product.category_name || "",
      price: product.price || "",
      quantity: product.quantity ?? "",
      description: product.description || "",
      image: null,
    });
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
    setEditProductForm({
      name: "",
      category: "",
      price: "",
      quantity: "",
      description: "",
      image: null,
    });
  };

  const updateProduct = async (productId) => {
    const payload = new FormData();
    Object.entries(editProductForm).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== "") payload.append(key, value);
    });
    try {
      await http.patch(`/api/products/${productId}/`, payload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      cancelEditProduct();
      await loadData();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || "Update product failed."));
    }
  };

  const deleteProduct = async (productId) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      await http.delete(`/api/products/${productId}/`);
      if (editingProductId === productId) cancelEditProduct();
      await loadData();
    } catch (err) {
      setError(JSON.stringify(err.response?.data || "Delete product failed."));
    }
  };

  return (
    <section className="page-wrap two-col">
      <div className="panel full-span">
        <h2>Schedule Control</h2>
        <p className="muted">Set supplier and driver login windows from the admin schedule page.</p>
        <div className="row">
          <Link className="primary-btn" to="/schedule-task">
            Open Schedule Task
          </Link>
        </div>
      </div>

      <div className="panel">
        <h2>Create Supplier/Driver/Customer</h2>
        <form onSubmit={createUser}>
          <input name="username" required placeholder="Username" value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} />
          <input name="email" required placeholder="Email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <input name="full_name" required placeholder="Full name" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} />
          <input name="phone" required placeholder="Phone" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          <input name="address" placeholder="Address" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          <select name="role" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
            <option value="supplier">Supplier</option>
            <option value="driver">Driver</option>
            <option value="customer">Customer</option>
          </select>
          <input name="company_name" placeholder="Company name (supplier)" value={form.company_name} onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))} />
          <input name="profile_image" type="file" accept="image/*" onChange={(e) => setForm((p) => ({ ...p, profile_image: e.target.files?.[0] || null }))} />
          <input name="password" type="password" required placeholder="Password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          <input name="password_confirm" type="password" required placeholder="Confirm password" value={form.password_confirm} onChange={(e) => setForm((p) => ({ ...p, password_confirm: e.target.value }))} />
          <button className="primary-btn" type="submit">Create User</button>
        </form>
      </div>

      <div className="panel">
        <h2>Pending Payments</h2>
        {!payments.length ? <p className="muted">No pending payments.</p> : null}
        {payments.map((payment) => (
          <article key={payment.id} className="order-card">
            <div>
              <p>#{payment.control_number}</p>
              <p>Status: {payment.status}</p>
              <p>Order ID: #{payment.sale_id}</p>
              <p>Customer: {payment.customer_name || "Unknown"}</p>
            </div>
            {payment.status !== "confirmed" ? (
              <button className="primary-btn" onClick={() => confirmPayment(payment.id)} type="button">
                Confirm
              </button>
            ) : (
              <span className="ok">Confirmed ✓</span>
            )}
          </article>
        ))}
      </div>

      <div className="panel full-span">
        <h2>Assign Drivers</h2>
        {sales.map((sale) => (
          <article key={sale.id} className="order-card">
            <div>
              <p>Order #{sale.id}</p>
              <p>Status: {sale.status}</p>
            </div>
            <select name="driver_id" defaultValue="" onChange={(e) => assignDriver(sale.id, e.target.value)}>
              <option value="">Assign Driver</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name}
                </option>
              ))}
            </select>
          </article>
        ))}
      </div>

      <div className="panel full-span">
        <h2>Manage Products</h2>
        <div className="grid-products">
          {products.map((product) => (
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
                  <button type="button" className="primary-btn" onClick={() => startEditProduct(product)}>
                    Edit
                  </button>
                  <button type="button" className="ghost-btn" onClick={() => deleteProduct(product.id)}>
                    Delete
                  </button>
                </div>
                {editingProductId === product.id ? (
                  <div>
                    <input
                      name="name"
                      value={editProductForm.name}
                      onChange={(e) => setEditProductForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Name"
                    />
                    <input
                      name="category"
                      value={editProductForm.category}
                      onChange={(e) => setEditProductForm((p) => ({ ...p, category: e.target.value }))}
                      placeholder="Category"
                    />
                    <input
                      name="price"
                      type="number"
                      value={editProductForm.price}
                      onChange={(e) => setEditProductForm((p) => ({ ...p, price: e.target.value }))}
                      placeholder="Price"
                    />
                    <input
                      name="quantity"
                      type="number"
                      value={editProductForm.quantity}
                      onChange={(e) => setEditProductForm((p) => ({ ...p, quantity: e.target.value }))}
                      placeholder="Quantity"
                    />
                    <textarea
                      name="description"
                      value={editProductForm.description}
                      onChange={(e) => setEditProductForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Description"
                    />
                    <input
                      name="image"
                      type="file"
                      accept="image/*"
                      onChange={(e) => setEditProductForm((p) => ({ ...p, image: e.target.files?.[0] || null }))}
                    />
                    <div className="row">
                      <button type="button" className="primary-btn" onClick={() => updateProduct(product.id)}>
                        Save
                      </button>
                      <button type="button" className="ghost-btn" onClick={cancelEditProduct}>
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
      {error ? <p className="error full-span">{error}</p> : null}
    </section>
  );
}

export default AdminDashboardPage;
