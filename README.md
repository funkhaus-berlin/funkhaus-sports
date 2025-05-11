# Stripe developer guide

```
https://docs.stripe.com/webhooks/quickstart?lang=node
```

# install CLI https://docs.stripe.com/stripe-cli

# Forward Stripe webhooks to your local server:

```bash
stripe listen --forward-to http://localhost:8888/api/stripe-webhook
```

# Netlify run

```bash
netlify dev
```

# update packages

```bash
yarn up -i '*'
```


# Remove Netlify CLI global and local configs
rm -rf ~/.netlify
rm -rf ~/.config/netlify
rm -rf .netlify

# Optional: Reinstall CLI if it keeps acting weird
npm uninstall -g netlify-cli
npm install -g netlify-cli
