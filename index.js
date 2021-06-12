// @ts-check
const cloneDeep = require('lodash/cloneDeep')
const merge = require('lodash/merge')

/**
 * Simple utility for building JSON Schema.
 */
class SchemaObject {
  constructor (type, properties) {
    if (typeof type === 'object') {
      Object.assign(this, type)
      return
    }

    this.data = {
      type,
      properties
    }

    this.meta = {}

    // Set by merging it onto a different object.
    this.parent = null
    this.propName = null

    if (type === 'object') {
      this.data.additionalProperties = false
    }

    if (this.data.properties) {
      Object.keys(this.data.properties).forEach(property => {
        if (this.data.properties[property].meta && this.data.properties[property].meta.required) {
          this.data.required = (this.data.required || []).concat(property)
        }

        if (this.data.properties[property] instanceof SchemaObject || this.data.properties[property] instanceof SchemaJoin) {
          const constructor = this.data.properties[property] instanceof SchemaObject ? SchemaObject : SchemaJoin
          this.data.properties[property] = new constructor({ ...this.data.properties[property], parent: this, propName: property, title: property })
        } else if (this.data.properties[property] instanceof Function && commonConversions.has(this.data.properties[property])) {
          const cloning = commonConversions.get(this.data.properties[property])
          const replacement = new SchemaObject({ ...cloning, title: property, propName: property, parent: this, meta: { ...cloning.meta, required: true } })
          this.data.properties[property] = replacement
          this.data.required = (this.data.required || []).concat(property)
        }
      })
    }
  }

  /**
   * Adds a field to be required by the object
   * @param {string} field
   * @returns {SchemaObject}
   */
  addRequired (field) {
    return this._overrideDataAttribute('required', [...this.data.required || [], field])
  }

  /**
   * Allows you to specify if additional unknown properties should be allowed.
   * @param {Boolean} value
   * @returns {SchemaObject}
   */
  allowAdditional (value) {
    if (this.data.type === 'object') {
      return this._overrideDataAttribute('additionalProperties', value)
    }
    return this._overrideDataAttribute('additionalItems', value)
  }

  _overrideDataAttribute (name, value) {
    return new SchemaObject({ ...this, data: { ...this.data, [name]: value } })
  }

  /**
   * Allows you to set a description for the property.
   * @param {String} text
   * @returns {SchemaObject}
   */
  description (text) {
    return this._overrideDataAttribute('description', text)
  }

  /**
   * Used to denote that this field should be optional. Please note that this will not currently undo
   * being made a required field if it has already been flagged as "required".
   * @returns {SchemaObject}
   */
  optional () {
    return new SchemaObject({ ...this, meta: { ...this.meta, required: false } })
  }

  /**
   * Makes the property required in whatever parent consumes it.
   * @returns {SchemaObject}
   */
  required () {
    return new SchemaObject({ ...this, meta: { ...this.meta, required: true } })
  }

  /**
   * Sets the minimum size of an array, length of a string, lower bound of an integer,
   * or the minimum number of properties on an object.
   * @param {Number} value
   * @returns {SchemaObject}
   */
  min (value) {
    if (this.data.type === 'array') {
      return this._overrideDataAttribute('minItems', value)
    }
    if (this.data.type === 'string') {
      return this._overrideDataAttribute('minLength', value)
    }

    if (this.data.type === 'object') {
      return this._overrideDataAttribute('minProperties', value)
    }

    return this._overrideDataAttribute('minimum', value)
  }

  /**
   * Sets the maximum size of an array, length of a string, lower bound of an integer,
   * or the minimum number of properties on an object.
   * @param {Number} value
   * @returns {SchemaObject}
   */
  max (value) {
    if (this.data.type === 'array') {
      return this._overrideDataAttribute('maxItems', value)
    }
    if (this.data.type === 'string') {
      return this._overrideDataAttribute('maxLength', value)
    }

    if (this.data.type === 'object') {
      return this._overrideDataAttribute('maxProperties', value)
    }

    return this._overrideDataAttribute('maximum', value)
  }

  /**
   * Sets a regex pattern for a string.
   * @param {String} regex
   * @returns {SchemaObject}
   */
  pattern (regex) {
    return this._overrideDataAttribute('pattern', regex)
  }

  /**
   * Sets the absolute number of properties, string length, or size of an array.
   * @param {Number} value
   * @returns {SchemaObject}
   */
  length (value) {
    const clone = this.clone()

    if (clone.data.type === 'array') {
      clone.data.minItems = value
      clone.data.maxItems = value
      return this
    }

    if (clone.data.type === 'string') {
      clone.data.minLength = value
      clone.data.maxLength = value
      return this
    }

    if (clone.data.type === 'object') {
      clone.data.minProperties = value
      clone.data.maxProperties = value
      return this
    }

    clone.data.length = value
    return clone
  }

  /**
   * Gives an object a title.
   * @param {String} name
   * @returns {SchemaObject}
   */
  title (name) {
    return this._overrideDataAttribute('title', name)
  }

  /**
   * Allows the specification of definitions
   * @param {*} x
   * @returns {SchemaObject}
   */
  definitions (x) {
    return this._overrideDataAttribute('definitions', x)
  }

  /**
   * Allows you to specify a custom attribute on the JSON Schema.
   * @param {String} name
   * @param {*} value
   * @returns {SchemaObject}
   */
  attr (name, value) {
    return this._overrideDataAttribute(name, value)
  }

  /**
   * Allows you to specify the items contained within an array.
   * @param {*} schema
   * @returns {SchemaObject}
   */
  items (schema) {
    const clone = {
      ...this,
      data: {
        ...this.data,
        items: schema,
        additionalItems: !Array.isArray(schema)
      }
    }

    if (Array.isArray(clone.data.items)) {
      clone.data.items = clone.data.items.map(item => {
        return module.exports.convert(item) || item
      })
    } else clone.data.items = module.exports.convert(clone.data.items) || clone.data.items

    return new SchemaObject(clone)
  }

  /**
   * Returns a copy of the schema object.
   * @returns {SchemaObject}
   */
  clone () {
    return merge(new SchemaObject(), cloneDeep(this))
  }

  /**
   * Returns the generated JSON Schema.
   * @param {Boolean} cloned
   * @returns
   */
  toJSON (cloned) {
    if (this.data.properties || this.data.items) {
      if (!cloned) {
        return this.clone().toJSON(true)
      }

      if (this.data.properties) {
        Object.keys(this.data.properties).forEach(property => {
          if (this.data.properties[property].toJSON) { this.data.properties[property] = this.data.properties[property].toJSON() }
        })
        if (!Object.keys(this.data.properties).length) delete this.data.properties
      }

      if (this.data.items) {
        if (Array.isArray(this.data.items)) {
          Object.keys(this.data.items).forEach(item => {
            if (this.data.items[item].toJSON) { this.data.items[item] = this.data.items[item].toJSON() }
          })
        } else {
          if (this.data.items.toJSON) { this.data.items = this.data.items.toJSON() }
        }
      }
    }

    if (this.data.properties === undefined) delete this.data.properties

    return { ...this.data }
  }
}

class SchemaJoin {
  constructor (type, arr) {
    if (typeof type === 'object') {
      Object.assign(this, type)
      return
    }
    this.data = {}
    this.meta = {}
    this.type = type
    this.arr = arr
    this.parent = null
    this.propName = null
  }

  optional () {
    return this
  }

  required () {
    if (this.parent) {
      this.parent.addRequired(this.propName)
    }
    this.meta.required = true
    return this
  }

  toJSON () {
    return { [this.type]: this.arr.map(i => i.toJSON ? i.toJSON() : i), ...this.data }
  }
}

class Schema {
  number () {
    return new SchemaObject('number')
  }

  object (properties) {
    return new SchemaObject('object', properties)
  }

  boolean () {
    return new SchemaObject('boolean')
  }

  array (arr) {
    const res = new SchemaObject('array')
    if (arr) return res.items(arr)
    return res
  }

  convert (x) {
    if (commonConversions.has(x)) return commonConversions.get(x)
  }

  permissiveNumber () {
    return this.anyOf([this.number(), this.string().pattern('^[0-9]+$')])
  }

  integer () {
    return new SchemaObject('integer')
  }

  anyOf (arr) {
    return new SchemaJoin('anyOf', arr)
  }

  string () {
    return new SchemaObject('string')
  }
}

const commonConversions = new Map()
commonConversions.set(Number, new SchemaObject('number').required())
commonConversions.set(String, new SchemaObject('string').required())
commonConversions.set(Boolean, new SchemaObject('boolean').required())
commonConversions.set(Object, new SchemaObject('object').required().allowAdditional(true))

module.exports = new Schema()
