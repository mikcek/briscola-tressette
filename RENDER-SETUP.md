# Istruzioni Render (IMPORTANTE)

Nei log compare ancora:

```text
Running build command 'npm start'
```

Quindi in dashboard il **Build Command** è sbagliato.

## Correzione (2 minuti)

1. Apri il servizio su Render
2. Vai su **Settings**
3. Sezione **Build & Deploy**
4. **Build Command** → cancella tutto e scrivi esattamente:

```text
npm install
```

5. **Start Command** → deve essere:

```text
npm start
```

6. Salva (**Save Changes**)
7. **Manual Deploy** → **Deploy latest commit**

## Alternativa più semplice

1. Cancella il servizio attuale (Settings → Delete)
2. Dashboard → **New** → **Blueprint**
3. Collega il repo `mikcek/briscola-tressette`
4. Conferma: userà `render.yaml` già corretto
