import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import productPlaceholder from "../assets/product-placeholder.svg";
import { http } from "../api/http.jsx";
import StoreQrCard from "../components/StoreQrCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { getApiErrorMessage } from "../lib/apiErrors.js";
import { applyImageFallback, toMediaUrl } from "../lib/media.jsx";

const PRODUCT_PLACEHOLDER = productPlaceholder;
const HOME_AUTO_RETRY_MS = 6000;

function productListFromResponse(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
}

function HomePage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const searchInputRef = useRef(null);
  const searchOpen = location.pathname === "/search";
  const filterOpen = location.pathname === "/filter" || location.pathname === "/category";
  const query = searchOpen ? searchParams.get("q") || "" : "";
  const activeCategory = location.pathname === "/category" ? searchParams.get("name") || "all" : "all";

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await http.get("/api/products/");
      setProducts(productListFromResponse(response.data));
    } catch (err) {
      setError(getApiErrorMessage(err, "Products could not load right now."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!error || products.length) return undefined;
    const retryTimer = window.setTimeout(() => {
      loadProducts();
    }, HOME_AUTO_RETRY_MS);
    return () => window.clearTimeout(retryTimer);
  }, [error, loadProducts, products.length]);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
      document.getElementById("products")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searchOpen]);

  const categories = useMemo(() => {
    const names = products.map((product) => product.category_name || "General");
    return ["all", ...Array.from(new Set(names))];
  }, [products]);

  const visibleProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return products.filter((product) => {
      const category = String(product.category_name || "General");
      const matchesCategory =
        activeCategory === "all" || category.toLowerCase() === activeCategory.toLowerCase();
      const matchesSearch =
        !normalizedQuery ||
        [product.name, product.description, product.category_name]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, products, query]);

  const toggleSearch = () => {
    navigate(searchOpen ? "/home" : "/search");
  };

  const toggleFilter = () => {
    navigate(filterOpen ? "/home" : "/filter");
  };

  const resetProductView = () => {
    navigate("/home");
  };

  const openProduct = (productId) => {
    if (!isAuthenticated) {
      alert("Please login first to open product details.");
      navigate("/login", { state: { from: `/products/${productId}` } });
      return;
    }
    navigate(`/products/${productId}`);
  };

  const aboutLinks = [
    {
      label: "WhatsApp",
      href: "https://wa.me/255711252758",
      value: "+255 711 252 758",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4a8 8 0 0 0-6.94 11.98L4 20l4.18-1.03A8 8 0 1 0 12 4Z" />
          <path d="M9.25 8.7c.16-.36.33-.37.48-.38h.41c.14 0 .36.05.55.45.19.41.63 1.55.69 1.66.06.11.1.24.02.38-.08.14-.12.23-.24.35-.12.12-.25.27-.35.36-.12.11-.24.24-.1.46.14.23.63 1.04 1.34 1.68.92.82 1.69 1.08 1.93 1.2.24.12.38.1.52-.06.14-.16.57-.67.72-.9.15-.23.31-.19.52-.11.21.08 1.34.63 1.57.74.23.11.38.17.43.27.05.1.05.59-.14 1.15-.19.56-1.11 1.07-1.53 1.12-.39.05-.88.07-1.43-.12-.33-.11-.75-.24-1.28-.47-2.26-.98-3.74-3.38-3.85-3.53-.11-.15-.92-1.22-.92-2.33 0-1.11.58-1.64.78-1.87Z" />
        </svg>
      ),
    },
    {
      label: "Instagram",
      href: "https://instagram.com/_.infaan_",
      value: "@_.infaan_",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4.5" y="4.5" width="15" height="15" rx="4" />
          <circle cx="12" cy="12" r="3.7" />
          <circle cx="17.2" cy="6.9" r="1" />
        </svg>
      ),
    },
    {
      label: "Email",
      href: "mailto:infaanhameed@gmail.com",
      value: "infaanhameed@gmail.com",
      icon: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <path d="M4.5 7.5 12 13l7.5-5.5" />
        </svg>
      ),
    },
  ];

  return (
    <section className="page-wrap">
      <header className="marketplace-return" aria-label="Marketplace quick actions">
        <h1>Marketplace</h1>
        <div className="marketplace-actions">
          <button
            type="button"
            className={searchOpen ? "market-action-btn active" : "market-action-btn"}
            onClick={toggleSearch}
            aria-label="Search products"
            aria-pressed={searchOpen}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="5.5" />
              <path d="M15 15l4 4" />
            </svg>
          </button>
          <button
            type="button"
            className={filterOpen ? "market-action-btn active" : "market-action-btn"}
            onClick={toggleFilter}
            aria-label="Filter products"
            aria-pressed={filterOpen}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 7h14" />
              <path d="M8 12h8" />
              <path d="M11 17h2" />
            </svg>
          </button>
          <button type="button" className="market-action-btn" onClick={resetProductView} aria-label="View all products">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="5" y="5" width="5" height="5" rx="1" />
              <rect x="14" y="5" width="5" height="5" rx="1" />
              <rect x="5" y="14" width="5" height="5" rx="1" />
              <rect x="14" y="14" width="5" height="5" rx="1" />
            </svg>
          </button>
        </div>
        {(searchOpen || filterOpen) ? (
          <div className="marketplace-tools">
            {searchOpen ? (
              <input
                ref={searchInputRef}
                name="product_search"
                type="search"
                placeholder="Search product name, description, or category"
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  navigate(nextQuery ? `/search?q=${encodeURIComponent(nextQuery)}` : "/search", { replace: true });
                }}
              />
            ) : null}
            {filterOpen ? (
              <div className="category-filter-row" aria-label="Product categories">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={category === activeCategory ? "category-filter active" : "category-filter"}
                    onClick={() => navigate(category === "all" ? "/filter" : `/category?name=${encodeURIComponent(category)}`)}
                  >
                    {category === "all" ? "All" : category}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </header>
      {loading && !products.length ? <p>Loading products...</p> : null}
      {error ? (
        <div className="load-error-panel">
          <p className="error">{error}</p>
          <button type="button" className="ghost-btn" onClick={loadProducts} disabled={loading}>
            {loading ? "Retrying..." : "Retry"}
          </button>
        </div>
      ) : null}
      <h2 id="products" className="section-title">Products</h2>
      <div className="grid-products product-grid">
        {visibleProducts.map((product) => (
          <article
            className="product-card"
            key={product.id}
            role="button"
            tabIndex={0}
            onClick={() => openProduct(product.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") openProduct(product.id);
            }}
          >
            <div className="card-image">
              <img
                src={toMediaUrl(product.image_url || product.image) || PRODUCT_PLACEHOLDER}
                alt={product.name}
                data-fallback-src={PRODUCT_PLACEHOLDER}
                onError={applyImageFallback}
              />
            </div>
            <div className="card-body">
              <h3 className="product-title">{product.name}</h3>
              <div className="product-meta-row">
                <span className="product-chip">{product.category_name || "General"}</span>
                <span className="product-price">TZS {product.price}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!loading && !visibleProducts.length ? <p className="muted">No products match your search.</p> : null}
      <section className="about-home-section" aria-labelledby="about-us-title">
        <div className="about-home-card">
          <div className="about-home-copy">
            <p className="auth-eyebrow">About Us</p>
            <h2 id="about-us-title" className="section-title">
              Supermarket Zanzibar
            </h2>
            <p className="muted">
              Supermarket Zanzibar serves customers across Zanzibar with everyday groceries, snacks, drinks, household
              items, and quick delivery support. We focus on making shopping simple, reliable, and friendly for local
              families, visitors, and busy customers who want trusted products in one place.
            </p>
          </div>
          <div className="about-home-links" aria-label="Contact Supermarket Zanzibar">
            {aboutLinks.map((link) => (
              <a key={link.label} className="about-contact-btn" href={link.href} target="_blank" rel="noreferrer">
                <span className="about-contact-icon">{link.icon}</span>
                <span className="about-contact-copy">
                  <strong>{link.label}</strong>
                  <span>{link.value}</span>
                </span>
              </a>
            ))}
          </div>
          <StoreQrCard />
        </div>
      </section>
      {!isAuthenticated ? (
        <p className="callout">
          New customer? <Link to="/register">Create account</Link> to open products, add cart, and checkout.
        </p>
      ) : null}
    </section>
  );
}

export default HomePage;
