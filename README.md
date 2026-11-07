# Visualizador Geoespacial do NGEO/IDEFLOR-Bio

Aplicativo web de consulta e análise territorial desenvolvido pelo **NGEO** (Núcleo de Geoinformação) do **IDEFLOR-Bio** (Instituto de Desenvolvimento Florestal e da Biodiversidade do Estado do Pará). É uma ferramenta interna do NGEO, disponibilizada ao público. Reúne limites, unidades de conservação, terras indígenas, territórios quilombolas e bases institucionais em um mapa interativo, pensado para reuniões técnicas e apoio à decisão.

**Acesse:** [https://ngeo-ideflor-bio.github.io/visualizador/](https://ngeo-ideflor-bio.github.io/visualizador/)

---

## O que mudou na versão 2

A versão anterior carregava **80,5 MB de GeoJSON** (2,5 milhões de vértices) e montava as 11 camadas de uma vez, mesmo as desligadas. O resultado era um carregamento de dezenas de segundos e navegação travada.

A versão atual usa **tiles vetoriais PMTiles** e **MapLibre GL (WebGL)**:

| Métrica | Antes (Leaflet + GeoJSON) | Agora (MapLibre + PMTiles) |
|---|---|---|
| Download inicial | ~27 MB (gzip) | **~1 MB** (gzip) |
| Dados do mapa no primeiro paint | 80,5 MB | **~250 KB** (cabeçalho + tiles visíveis) |
| Camadas renderizadas no boot | 11 (todas) | 5 visíveis; as demais só quando ativadas |
| Vértices no renderizador | 2,5 milhões | tiles simplificados por zoom |
| Motor de desenho | SVG | WebGL |
| Estado da interface | Tailwind compilado em runtime | CSS estático (~1,5 mil linhas de menos) |

O arquivo `data/territorio.pmtiles` tem 29,6 MB no total, mas o navegador baixa apenas o cabeçalho e os tiles da área visível, sob demanda (HTTP Range).

---

## Funcionalidades

- **Clique para identificar**: um clique no mapa abre uma gaveta com todas as feições daquele ponto, agrupadas por camada, com destaque da geometria no mapa. Não existe mais “modo identificar”.
- **Catálogo de camadas**: lista agrupada (Limites, Socioambiental, Unidades de Conservação, IDEFLOR-Bio), com contagem de feições, olho para exibir/ocultar e opacidade individual.
- **Reordenar sobreposição**: o botão **Ordenar** transforma a lista em uma pilha; arraste para definir o que fica na frente.
- **Filtro por atributo**: selecione camada, campo e valor. O mapa aproxima o recorte automaticamente, destaca o limite em azul e mostra a contagem. Filtros em municípios/regiões também recortam as camadas sobrepostas (comparação sem diferenciar maiúsculas/minúsculas).
- **Baixar GeoJSON**: exporta o recorte atual com a **geometria completa**, buscando o arquivo original só no momento do download.
- **Subir arquivo vetorial**: GeoJSON, KML e Shapefile (`.zip`), processados 100% no navegador. O arquivo entra no catálogo, pode ser filtrado, identificado e baixado.
- **Modo contorno**: exibe apenas os limites das áreas, ideal sobre imagem de satélite.
- **Mapa de base**: neutro (claro/escuro, seguindo o tema) ou imagem de satélite (Esri World Imagery).
- **Legenda recolhível**: mostra as camadas visíveis e as categorias do zoneamento.
- **Tema claro/escuro** (abre no claro por padrão) e preferências de camadas salvas no navegador.
- **Responsivo**: painel vira uma gaveta inferior no celular; a identificação vira uma folha inferior.
- **Instalável (PWA)**: manifesto, ícones e service worker. O app abre em janela própria, o app shell fica em cache e o botão **Instalar aplicativo** aparece no ⓘ quando o navegador permite.

---

## Arquitetura

```
index.html            aplicação (sem build step)
css/app.css           design system próprio, sem Tailwind
js/app.js             mapa, catálogo, filtros, identificação, upload
vendor/               MapLibre GL, PMTiles, Sortable, shpjs, togeojson (versões fixas, locais)
manifest.json         manifesto PWA (nome, ícones, atalhos)
sw.js                 service worker (cache do app shell; PMTiles segue por Range)
icons/                ícones 192/512, maskable e apple-touch-icon
data/
  territorio.pmtiles  tiles vetoriais z4–z12 (fonte única das 12 camadas)
  layers.json         metadados, simbologia e estatísticas de filtro (~180 KB)
  *.geojson           bases originais em resolução completa (usadas só no download)
assets/               fontes Rawline e logotipos otimizados
scripts/
  build-data.mjs      normaliza os GeoJSON e gera layers.json + script do tippecanoe
  serve.mjs           servidor local com suporte a Range e gzip
documentacao.html     documentação funcional
index-legacy.html     versão anterior (Leaflet + GeoJSON), mantida para comparação
```

Decisões principais:

- **Um único arquivo PMTiles** com 12 *source layers*. Como as camadas compartilham os mesmos tiles, ligar/desligar uma camada é instantâneo depois que a área já foi carregada.
- **`_fid`** é injetado em cada feição para permitir `feature-state` (destaque da feição selecionada).
- **`cor_zona`** é calculada no pipeline para a simbologia institucional do zoneamento.
- **`layers.json`** concentra rótulos, cores, campos primários e os valores únicos de cada campo com contagem, para popular o filtro sem varrer os dados.
- **MapLibre GL JS 6** com o protocolo PMTiles registrado em runtime.
- Bibliotecas e fontes são locais e versionadas; não há dependência de CDN no carregamento inicial.
- **PWA** com `manifest.json` + `sw.js`: o app shell é cacheado, mas requisições com `Range` e o arquivo `.pmtiles` passam direto para preservar o carregamento por partes.

---

## Rodando localmente

O app precisa ser servido por HTTP (módulos ES, `fetch` e PMTiles não funcionam em `file://`).

```bash
node scripts/serve.mjs
# abra http://localhost:4173/
```

O servidor de desenvolvimento suporta `Range` (necessário para PMTiles) e gzip.

O service worker é registrado em `https://` ou `localhost`. Para testar a instalação, use `http://localhost:4173/` ou o site publicado; em `file://` ele não é registrado. O app shell funciona offline depois da primeira visita; os tiles do mapa e os downloads continuam online.

Para publicar, basta servir os arquivos estáticos do repositório. O GitHub Pages já suporta Range Requests. Se usar outro host (S3, Netlify, IIS), confirme que `Range` está habilitado para `data/territorio.pmtiles`.

---

## Regerando os dados

Só é necessário quando os GeoJSON de `data/` forem atualizados.

Pré-requisitos:

- Node.js 18+
- WSL com Ubuntu e `tippecanoe` (`sudo apt install tippecanoe`)
- CLI `pmtiles` ([protomaps/go-pmtiles](https://github.com/protomaps/go-pmtiles/releases))

```bash
# 1. normaliza coordenadas (5 casas), injeta _fid/_label/cor_zona,
#    calcula as estatísticas de filtro e gera data/layers.json
node scripts/build-data.mjs

# 2. gera o MBTiles (o script imprime o caminho e o comando)
wsl -d Ubuntu -u root --exec bash "/mnt/c/.../visualizador-tiles/build.sh"

# 3. converte para PMTiles
pmtiles convert ".../visualizador-tiles/territorio.mbtiles" data/territorio.pmtiles --force
```

Parâmetros atuais do tippecanoe: zoom 4–12, `--simplification=3`, `--drop-densest-as-needed`. Para mais detalhe em zoom alto, aumente `TILE_MAXZOOM=13` (o arquivo cresce).

O script grava os GeoJSON normalizados em `%TEMP%/visualizador-tiles` e imprime os comandos exatos para o seu sistema.

---

## Limitações conhecidas

- O mapa usa geometria simplificada (tiles z4–z12). O **download** sempre usa a geometria completa do GeoJSON original.
- Camadas grandes (zoneamento, UCs federais) podem levar alguns segundos para baixar no primeiro download do recorte; depois ficam em cache na sessão.
- Filtros e identificação usam os atributos dos tiles. Campos com mais de 250 valores únicos (ex.: área) não aparecem no filtro.
- Uploads valem para a sessão atual; não são persistidos.
- O PMTiles é um arquivo de ~30 MB no repositório. Arquivos acima de 50 MB não são recomendados no GitHub.
- O modo offline cobre o app shell (interface, catálogo, filtros e legenda). Os tiles do mapa e os downloads de GeoJSON precisam de conexão.

---

## Versão anterior

`index-legacy.html` mantém a versão Leaflet + GeoJSON para comparação. Ela continua funcional, mas carrega todos os dados de uma vez e não recebe as melhorias da v2.

---

## Tecnologias

- **MapLibre GL JS 6.16** — renderização WebGL
- **PMTiles 4.5** — tiles vetoriais em arquivo único com Range Requests
- **Tippecanoe 2.53** — geração dos tiles (via WSL)
- **shpjs / toGeoJSON** — leitura de Shapefile e KML no navegador
- **SortableJS** — reordenação das camadas
- **PWA (manifest + service worker)** — instalação e cache do app shell
- **Rawline** — tipografia do Design System gov.br

---

## Licença

Desenvolvido pelo **NGEO / IDEFLOR-Bio / Governo do Estado do Pará**.
