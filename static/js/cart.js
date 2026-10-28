"use strict";

const CART_STORAGE_KEY = "sejos-cart-v1";
const FREE_STANDARD_DELIVERY_THRESHOLD_KES = 7500;
const STANDARD_DELIVERY_PRICE_KES = 500;
const EXPRESS_DELIVERY_PRICE_KES = 1200;

const products = {
    headphones: {
        name: "Wireless Headphones",
        category: "Electronics",
        price: 4900,
        artClass: "product-art-headphones",
        icon: "♫",
        iconLabel: "Headphones"
    },
    backpack: {
        name: "Everyday Backpack",
        category: "Accessories",
        price: 3600,
        artClass: "product-art-bag",
        icon: "▰",
        iconLabel: "Backpack"
    },
    mug: {
        name: "Stoneware Coffee Mug",
        category: "Home & Living",
        price: 1400,
        artClass: "product-art-mug",
        icon: "☕",
        iconLabel: "Coffee mug"
    },
    watch: {
        name: "Everyday Smartwatch",
        category: "Electronics",
        price: 5900,
        artClass: "product-art-watch",
        icon: "◷",
        iconLabel: "Smartwatch"
    }
};

function readCart() {
    const storedCart = localStorage.getItem(CART_STORAGE_KEY);
    if (storedCart === null) {
        return [];
    }

    const parsedCart = JSON.parse(storedCart);
    if (!Array.isArray(parsedCart)) {
        throw new Error("Saved cart data is invalid.");
    }

    return parsedCart.filter((item) =>
        item &&
        Object.hasOwn(products, item.id) &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 99
    );
}

function formatPrice(amountKes) {
    return `KSh ${amountKes.toLocaleString("en-KE")}`;
}

function saveCart(nextCart) {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart));
}

function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
        element.className = className;
    }
    if (text !== undefined) {
        element.textContent = text;
    }
    return element;
}

function initializeCartPage() {
    const itemsContainer = document.getElementById("cart-items");
    if (!itemsContainer) {
        return;
    }

    const notice = document.getElementById("cart-notice");
    const itemCount = document.getElementById("cart-item-count");
    const subtotalElement = document.getElementById("cart-subtotal");
    const shippingElement = document.getElementById("cart-shipping");
    const totalElement = document.getElementById("cart-total");
    const standardShippingPrice = document.getElementById("standard-shipping-price");
    const checkoutButton = document.getElementById("checkout-button");
    const mpesaForm = document.getElementById("mpesa-form");
    const phoneInput = document.getElementById("mpesa-phone");
    const phoneError = document.getElementById("mpesa-phone-error");
    const paymentStatus = document.getElementById("mpesa-payment-status");
    let cart;

    try {
        cart = readCart();
    } catch (error) {
        notice.textContent = "We couldn't read your saved cart. Please clear this site's saved data and try again.";
        notice.classList.add("is-visible");
        checkoutButton.disabled = true;
        return;
    }

    function render() {
        itemsContainer.replaceChildren();
        const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
        const subtotal = cart.reduce((total, item) => total + products[item.id].price * item.quantity, 0);
        const shippingInputs = document.querySelectorAll('input[name="shipping"]');
        if (cart.length === 0) {
            document.querySelector('input[name="shipping"][value="standard"]').checked = true;
        }
        shippingInputs.forEach((input) => {
            input.disabled = cart.length === 0;
        });
        const selectedShipping = document.querySelector('input[name="shipping"]:checked');
        const shipping = subtotal === 0
            ? 0
            : selectedShipping && selectedShipping.value === "express"
            ? EXPRESS_DELIVERY_PRICE_KES
            : subtotal >= FREE_STANDARD_DELIVERY_THRESHOLD_KES
                ? 0
                : STANDARD_DELIVERY_PRICE_KES;

        itemCount.textContent = `(${totalItems})`;
        subtotalElement.textContent = formatPrice(subtotal);
        shippingElement.textContent = shipping === 0 && subtotal > 0 ? "Free" : formatPrice(shipping);
        totalElement.textContent = formatPrice(subtotal + shipping);
        standardShippingPrice.textContent = subtotal >= FREE_STANDARD_DELIVERY_THRESHOLD_KES
            ? "Free"
            : formatPrice(STANDARD_DELIVERY_PRICE_KES);
        checkoutButton.disabled = cart.length === 0;
        if (cart.length === 0) {
            mpesaForm.hidden = true;
            mpesaForm.reset();
            phoneInput.removeAttribute("aria-invalid");
            phoneError.textContent = "";
            paymentStatus.textContent = "";
            paymentStatus.classList.remove("is-visible");
        }

        if (cart.length === 0) {
            const emptyState = createElement("div", "cart-empty");
            emptyState.append(
                createElement("span", "cart-empty-icon", "＋"),
                createElement("h3", "", "Your cart is waiting"),
                createElement("p", "", "You haven't added anything just yet. Explore the store and find something you'll love."),
            );
            const browseLink = createElement("a", "button", "Browse the store");
            browseLink.href = "store.html";
            emptyState.append(browseLink);
            itemsContainer.append(emptyState);
            return;
        }

        for (const item of cart) {
            const product = products[item.id];
            const row = createElement("article", "cart-item");
            const art = createElement("div", `cart-item-art ${product.artClass}`);
            art.setAttribute("role", "img");
            art.setAttribute("aria-label", product.iconLabel);
            art.append(createElement("span", "", product.icon));

            const details = createElement("div", "cart-item-details");
            details.append(
                createElement("p", "product-category", product.category),
                createElement("h3", "", product.name),
                createElement("p", "cart-item-unit-price", `${formatPrice(product.price)} each`)
            );

            const actions = createElement("div", "cart-item-actions");
            const quantityControls = createElement("div", "quantity-control");
            quantityControls.setAttribute("aria-label", `Quantity for ${product.name}`);

            const decreaseButton = createElement("button", "quantity-button", "−");
            decreaseButton.type = "button";
            decreaseButton.dataset.action = "decrease";
            decreaseButton.dataset.productId = item.id;
            decreaseButton.setAttribute("aria-label", `Decrease ${product.name} quantity`);

            const quantity = createElement("span", "quantity-value", String(item.quantity));
            quantity.setAttribute("aria-live", "polite");

            const increaseButton = createElement("button", "quantity-button", "+");
            increaseButton.type = "button";
            increaseButton.dataset.action = "increase";
            increaseButton.dataset.productId = item.id;
            increaseButton.disabled = item.quantity >= 99;
            increaseButton.setAttribute("aria-label", `Increase ${product.name} quantity`);

            quantityControls.append(decreaseButton, quantity, increaseButton);
            const lineTotal = createElement("strong", "cart-item-total", formatPrice(product.price * item.quantity));
            const removeButton = createElement("button", "remove-item", "Remove");
            removeButton.type = "button";
            removeButton.dataset.action = "remove";
            removeButton.dataset.productId = item.id;
            removeButton.setAttribute("aria-label", `Remove ${product.name} from cart`);
            actions.append(quantityControls, lineTotal, removeButton);
            row.append(art, details, actions);
            itemsContainer.append(row);
        }
    }

    function commitCart(nextCart) {
        try {
            saveCart(nextCart);
        } catch (error) {
            notice.textContent = "Your cart couldn't be saved in this browser. Check your browser storage settings and try again.";
            notice.classList.add("is-visible");
            return false;
        }

        cart = nextCart;
        notice.textContent = "";
        notice.classList.remove("is-visible");
        render();
        updateCartBadges();
        return true;
    }

    itemsContainer.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) {
            return;
        }

        const item = cart.find((entry) => entry.id === button.dataset.productId);
        if (!item) {
            return;
        }

        let nextCart;
        if (button.dataset.action === "remove") {
            nextCart = cart.filter((entry) => entry.id !== item.id);
        } else {
            const quantityChange = button.dataset.action === "increase" ? 1 : -1;
            const nextQuantity = item.quantity + quantityChange;
            nextCart = nextQuantity > 0
                ? cart.map((entry) => entry.id === item.id ? { ...entry, quantity: nextQuantity } : entry)
                : cart.filter((entry) => entry.id !== item.id);
        }

        commitCart(nextCart);
    });

    document.querySelectorAll('input[name="shipping"]').forEach((input) => {
        input.addEventListener("change", render);
    });

    checkoutButton.addEventListener("click", () => {
        mpesaForm.hidden = false;
        phoneInput.focus();
    });

    phoneInput.addEventListener("input", () => {
        phoneError.textContent = "";
        phoneInput.removeAttribute("aria-invalid");
        paymentStatus.textContent = "";
        paymentStatus.classList.remove("is-visible");
    });

    mpesaForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const phone = phoneInput.value.trim().replace(/[\s()-]/g, "");
        if (!/^(?:\+?254|0)(?:7|1)\d{8}$/.test(phone)) {
            phoneInput.setAttribute("aria-invalid", "true");
            phoneError.textContent = "Enter a valid Kenyan mobile number, such as 0712 345 678 or +254 712 345 678.";
            phoneInput.focus();
            return;
        }

        const normalizedPhone = phone.startsWith("+")
            ? phone
            : phone.startsWith("0")
                ? `+254${phone.slice(1)}`
                : `+${phone}`;
        phoneInput.removeAttribute("aria-invalid");
        phoneError.textContent = "";
        paymentStatus.classList.add("is-visible");
        paymentStatus.textContent = "Contacting the Daraja sandbox...";
        const submitButton = mpesaForm.querySelector('button[type="submit"]');
        const apiBase = (window.SEJOS_PAYMENT_API_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
        submitButton.disabled = true;

        try {
            const response = await fetch(`${apiBase}/api/payments/mpesa/stkpush`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: normalizedPhone,
                    items: cart,
                    shipping: document.querySelector('input[name="shipping"]:checked').value
                })
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "The payment request could not be started.");
            }

            paymentStatus.textContent = `${result.message || "Sandbox request sent."} Waiting for the sandbox callback.`;
            for (let attempt = 0; attempt < 20; attempt += 1) {
                await new Promise((resolve) => window.setTimeout(resolve, 3000));
                const statusResponse = await fetch(
                    `${apiBase}/api/payments/mpesa/${encodeURIComponent(result.checkoutRequestId)}`
                );
                const statusResult = await statusResponse.json();
                if (!statusResponse.ok) {
                    throw new Error(statusResult.error || "Could not check the payment status.");
                }

                if (statusResult.status === "paid") {
                    paymentStatus.textContent = "The sandbox reports this payment as complete. No real payment was taken.";
                    return;
                }
                if (statusResult.status === "failed" || statusResult.status === "cancelled") {
                    paymentStatus.textContent = statusResult.message || "The sandbox payment was not completed.";
                    return;
                }
                if (statusResult.status === "review") {
                    paymentStatus.textContent = statusResult.message || "The sandbox callback needs review. Do not treat this order as paid.";
                    return;
                }
            }

            paymentStatus.textContent = "Still waiting for the sandbox result. You can keep this page open or check the payment again later.";
        } catch (error) {
            if (error instanceof TypeError) {
                paymentStatus.textContent = `Cannot reach the payment server at ${apiBase}. Start the Node.js backend and open this site through VS Code Live Server, then try again.`;
            } else {
                paymentStatus.textContent = error.message;
            }
        } finally {
            submitButton.disabled = false;
        }
    });

    render();
}

function updateCartBadges() {
    const badges = document.querySelectorAll("[data-cart-count]");
    if (badges.length === 0) {
        return;
    }

    try {
        const count = readCart().reduce((total, item) => total + item.quantity, 0);
        badges.forEach((badge) => {
            badge.textContent = String(count);
            badge.setAttribute("aria-label", `${count} items in cart`);
        });
    } catch (error) {
        badges.forEach((badge) => {
            badge.textContent = "!";
            badge.setAttribute("aria-label", "Cart could not be loaded");
        });
    }
}

function initializeStoreButtons() {
    document.querySelectorAll(".add-to-cart").forEach((button) => {
        button.addEventListener("click", () => {
            const productId = button.dataset.productId;
            if (!Object.hasOwn(products, productId)) {
                return;
            }

            try {
                const cart = readCart();
                const existingItem = cart.find((item) => item.id === productId);
                if (existingItem) {
                    if (existingItem.quantity >= 99) {
                        window.location.href = "cart.html";
                        return;
                    }
                    existingItem.quantity += 1;
                } else {
                    cart.push({ id: productId, quantity: 1 });
                }
                saveCart(cart);
                window.location.href = "cart.html";
            } catch (error) {
                button.textContent = "Cart unavailable";
                button.disabled = true;
            }
        });
    });
}

initializeStoreButtons();
initializeCartPage();
updateCartBadges();
