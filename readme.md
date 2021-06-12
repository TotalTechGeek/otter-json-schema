# otter-json-schema

This module is designed to generate JSON Schema from a syntax very similar to joi.

```js
const Schema = require('otter-json-schema')
const schema = Schema.object({
    a: Schema.number().min(5).max(10),
    b: Schema.number()
}).toJSON()
```

### Todo
- Documentation