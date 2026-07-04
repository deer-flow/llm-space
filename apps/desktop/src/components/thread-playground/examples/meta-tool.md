Generate JSON structure for one or more LLM function calls based on any user request. The JSON should include the function's name, description, strictness, and parameters with its types and descriptions.

## Requirements

The JSON must include:
- `name`: A string representing the function's name.
- `description`: A string describing the function's purpose. Include `when to use` and `when not to use` if applicable.
- `strict`: A boolean indicating if the function call should be strict.
- `parameters`: An object detailing the function's parameters.
    - `type`: Must be "object".
    - `required`: An array of required parameter names.
    - `properties`: An object where each key is a parameter name and the value is an object with:
        - `type`: The data type of the parameter.
        - `description`: A string describing the parameter.
    - `additionalProperties`: A boolean indicating if additional properties are allowed.
- Follow Python PEP 8 style.

## Output Format

{
  "name": "function_name",
  "description": "Function description.",
  "strict": true,
  "parameters": {
    "type": "object",
    "required": ["parameter1", "parameter2"],
    "properties": {
      "parameter1": {
        "type": "data_type",
        "description": "Description of parameter1"
      },
      "parameter2": {
        "type": "data_type",
        "description": "Description of parameter2"
      }
    },
    "additionalProperties": false
  }
}

## Examples

**Input:** Create a function to calculate the area of a rectangle.

**Output:**

{
  "name": "calculate_rectangle_area",
  "description": "Calculates the area of a rectangle given its width and height.",
  "strict": true,
  "parameters": {
    "type": "object",
    "required": ["width", "height"],
    "properties": {
      "width": {
        "type": "number",
        "description": "The width of the rectangle"
      },
      "height": {
        "type": "number",
        "description": "The height of the rectangle"
      }
    },
    "additionalProperties": false
  }
}

---

**Input:** ls

**Output:**

{
  "name": "ls",
  "description": "Lists the contents of a specified directory. Use when you need to see files and folders in a directory. Do not use for file operations or content reading.",
  "strict": true,
  "parameters": {
    "type": "object",
    "required": ["description", "path"],
    "properties": {
      "description": {
        "type": "string",
        "description": "Must be the first parameter in the tool call. Explain to user why you need to perform this action"
      },
      "path": {
        "type": "string",
        "description": "The absolute directory path to list contents from"
      },
      "show_hidden": {
        "type": "boolean",
        "description": "Whether to show hidden files (starting with .)"
      },
      "sort_by": {
        "type": "string",
        "description": "Sort order: 'name', 'date', 'size', or 'type'"
      }
    },
    "additionalProperties": false
  }
}

## Notes
- Only output one function (the first one).
- Directly output the **JSON raw string** without "```json".
