-- Cosello initial schema (Phase 1+2 Supabase migration).
--
-- public.users.id is the canonical UUID, matching auth.users.id (FK + CASCADE).
-- All user-FK columns across the schema use UUID. There is NO phone_number on
-- public.users — phone is sourced via JOIN to auth.users.phone.
--
-- RLS is enabled on every table; no policies are defined because the FastAPI
-- backend connects with service_role and bypasses RLS by design.

-- ---------- users ----------
CREATE TABLE public.users (
    id                UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name      VARCHAR(100),
    neighborhood      VARCHAR(100),
    profile_picture   VARCHAR(255),
    pickup_address    VARCHAR(255),
    zip_code          VARCHAR(10),
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- communities ----------
CREATE TABLE public.communities (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(100) NOT NULL,
    description  VARCHAR(500),
    neighborhood VARCHAR(100),
    image        VARCHAR(255),
    is_public    BOOLEAN DEFAULT TRUE,
    invite_code  VARCHAR(20) NOT NULL UNIQUE,
    created_by   UUID NOT NULL REFERENCES public.users(id),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ix_communities_invite_code ON public.communities (invite_code);

-- ---------- community_members ----------
CREATE TABLE public.community_members (
    id           SERIAL PRIMARY KEY,
    community_id INTEGER NOT NULL REFERENCES public.communities(id),
    user_id      UUID NOT NULL REFERENCES public.users(id),
    role         VARCHAR(20) DEFAULT 'member',
    joined_at    TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_community_user UNIQUE (community_id, user_id)
);

-- ---------- join_requests ----------
CREATE TABLE public.join_requests (
    id           SERIAL PRIMARY KEY,
    community_id INTEGER NOT NULL REFERENCES public.communities(id),
    user_id      UUID NOT NULL REFERENCES public.users(id),
    status       VARCHAR(20) DEFAULT 'pending',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_join_request UNIQUE (community_id, user_id)
);

-- ---------- notifications ----------
CREATE TABLE public.notifications (
    id              SERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES public.users(id),
    type            VARCHAR(50) NOT NULL,
    title           VARCHAR(200) NOT NULL,
    message         VARCHAR(500) NOT NULL,
    is_read         BOOLEAN DEFAULT FALSE,
    community_id    INTEGER REFERENCES public.communities(id),
    related_user_id UUID REFERENCES public.users(id),
    listing_id      VARCHAR(20),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ix_notifications_user_id ON public.notifications (user_id);

-- ---------- wishlist_items ----------
CREATE TABLE public.wishlist_items (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES public.users(id),
    listing_id  VARCHAR(20) NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_wishlist_item UNIQUE (user_id, listing_id)
);
CREATE INDEX ix_wishlist_items_user_id ON public.wishlist_items (user_id);

-- ---------- friendships ----------
CREATE TABLE public.friendships (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES public.users(id),
    friend_id   UUID NOT NULL REFERENCES public.users(id),
    status      VARCHAR(20) DEFAULT 'accepted',
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_friendship UNIQUE (user_id, friend_id)
);

-- ---------- purchase_orders ----------
CREATE TABLE public.purchase_orders (
    id                     SERIAL PRIMARY KEY,
    listing_id             VARCHAR(20) NOT NULL,
    buyer_id               UUID NOT NULL REFERENCES public.users(id),
    seller_id              UUID NOT NULL REFERENCES public.users(id),
    status                 VARCHAR(20) DEFAULT 'pending',
    selected_pickup_slots  VARCHAR(2000),
    confirmed_time         VARCHAR(20),
    buyer_reviewed         BOOLEAN DEFAULT FALSE,
    seller_reviewed        BOOLEAN DEFAULT FALSE,
    pickup_address         VARCHAR(255),
    address_released       INTEGER DEFAULT 0,
    pickup_notified        INTEGER DEFAULT 0,
    list_cycle             INTEGER NOT NULL DEFAULT 0,
    listing_price_cents    INTEGER,
    confirmed_at           TIMESTAMPTZ,
    completed_at           TIMESTAMPTZ,
    created_at             TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ix_purchase_orders_listing_id  ON public.purchase_orders (listing_id);
CREATE INDEX ix_purchase_orders_buyer_id    ON public.purchase_orders (buyer_id);
CREATE INDEX ix_purchase_orders_seller_id   ON public.purchase_orders (seller_id);
CREATE INDEX ix_purchase_orders_confirmed_at ON public.purchase_orders (confirmed_at);
CREATE INDEX ix_purchase_orders_completed_at ON public.purchase_orders (completed_at);

-- ---------- listings ----------
CREATE TABLE public.listings (
    id                    VARCHAR(20) PRIMARY KEY,
    user_id               UUID NOT NULL REFERENCES public.users(id),
    brand                 VARCHAR(200),
    name                  VARCHAR(200),
    description           VARCHAR(2000),
    price_cents           INTEGER NOT NULL,
    condition             VARCHAR(20),
    condition_score       INTEGER,
    product_year          INTEGER,
    identifier_confidence VARCHAR(10),
    location              VARCHAR(100),
    tags                  VARCHAR(1000),
    communities           VARCHAR(1000),
    visibility            VARCHAR(20) DEFAULT 'public',
    image_url             VARCHAR(500),
    image_urls            VARCHAR(2000),
    pickup_location       VARCHAR(255),
    status                VARCHAR(20) DEFAULT 'open',
    category              VARCHAR(30) DEFAULT 'other',
    category_attributes   VARCHAR(2000),
    posted_at             DOUBLE PRECISION NOT NULL,
    original_posted_at    DOUBLE PRECISION,
    relist_count          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_listings_user_id   ON public.listings (user_id);
CREATE INDEX ix_listings_category  ON public.listings (category);
CREATE INDEX ix_listings_posted_at ON public.listings (posted_at);

-- ---------- listing_views ----------
CREATE TABLE public.listing_views (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES public.users(id),
    listing_id  VARCHAR(20) NOT NULL REFERENCES public.listings(id),
    source      VARCHAR(20) NOT NULL,
    dwell_ms    INTEGER NOT NULL DEFAULT 0,
    ts          DOUBLE PRECISION NOT NULL
);
CREATE INDEX ix_listing_views_user_id    ON public.listing_views (user_id);
CREATE INDEX ix_listing_views_listing_id ON public.listing_views (listing_id);
CREATE INDEX ix_listing_views_ts         ON public.listing_views (ts);

-- ---------- search_queries ----------
CREATE TABLE public.search_queries (
    id           SERIAL PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES public.users(id),
    query_text   VARCHAR(500) NOT NULL,
    filters_json TEXT,
    ts           DOUBLE PRECISION NOT NULL
);
CREATE INDEX ix_search_queries_user_id ON public.search_queries (user_id);
CREATE INDEX ix_search_queries_ts      ON public.search_queries (ts);

-- ---------- listing_interactions ----------
CREATE TABLE public.listing_interactions (
    id          SERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES public.users(id),
    listing_id  VARCHAR(20) NOT NULL REFERENCES public.listings(id),
    action      VARCHAR(30) NOT NULL,
    ts          DOUBLE PRECISION NOT NULL,
    CONSTRAINT uq_listing_interaction UNIQUE (user_id, listing_id, action)
);
CREATE INDEX ix_listing_interactions_user_id    ON public.listing_interactions (user_id);
CREATE INDEX ix_listing_interactions_listing_id ON public.listing_interactions (listing_id);
CREATE INDEX ix_listing_interactions_ts         ON public.listing_interactions (ts);

-- ---------- reviews ----------
CREATE TABLE public.reviews (
    id            SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL REFERENCES public.purchase_orders(id),
    reviewer_id   UUID NOT NULL REFERENCES public.users(id),
    reviewee_id   UUID NOT NULL REFERENCES public.users(id),
    reviewer_role VARCHAR(10) NOT NULL,
    rating        INTEGER NOT NULL,
    comment       VARCHAR(1000),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ix_reviews_order_id ON public.reviews (order_id);

-- ---------- RLS: enabled on every table; no policies (service_role bypasses) ----------
ALTER TABLE public.users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communities           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_views         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_interactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews               ENABLE ROW LEVEL SECURITY;
