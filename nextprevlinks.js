const { a, text } = require("@saltcorn/markup/tags");
const View = require("@saltcorn/data/models/view");
const Workflow = require("@saltcorn/data/models/workflow");
const Table = require("@saltcorn/data/models/table");
const Form = require("@saltcorn/data/models/form");
const Field = require("@saltcorn/data/models/field");
const db = require("@saltcorn/data/db");
const { stateFieldsToWhere } = require("@saltcorn/data/plugin-helper");

const configuration_workflow = () =>
  new Workflow({
    steps: [
      {
        name: "views",
        form: async (context) => {
          const table = await Table.findOne({ id: context.table_id });
          const fields = await table.getFields();
          const show_views = await View.find_table_views_where(
            context.table_id,
            ({ state_fields, viewtemplate, viewrow }) =>
              state_fields.some((sf) => sf.primary_key || sf.name === "id")
          );
          const show_view_opts = show_views.map((v) => v.name);
          return new Form({
            fields: [
              {
                name: "link_view",
                label: "View to link to",
                type: "String",
                required: true,
                attributes: {
                  options: show_view_opts.join(),
                },
              },
              {
                name: "label_field",
                label: "Label Field",
                type: "String",
                attributes: {
                  options: fields.map((f) => f.name).join(),
                },
              },
              {
                name: "fixed_label",
                label: "Fixed Label",
                sublabel:
                  "If both the label field and is fixed field are enabled, the fixed label will precede with the label field",
                type: "String",
              },
              {
                name: "order_field",
                label: "Order by",
                type: "String",
                required: true,
                attributes: {
                  options: fields.map((f) => f.name).join(),
                },
              },
              {
                name: "descending",
                label: "Descending",
                type: "Bool",
                required: true,
              },
            ],
          });
        },
      },
    ],
  });

const get_state_fields = () => [
  {
    name: "id",
    type: "Integer",
    required: true,
    primary_key: true,
  },
];

const run = async (
  table_id,
  viewname,
  { link_view, label_field, fixed_label, order_field, descending },
  state,
  extraArgs
) => {
  const table = await Table.findOne({ id: table_id });
  const fields = await table.getFields();
  const qstate = await stateFieldsToWhere({ fields, state });
  const pk = fields.find((f) => f.primary_key);
  const schema = db.getTenantSchemaPrefix();
  const current_row = await table.getRow(qstate);
  if (!current_row) return "";
  const dir = descending ? "desc" : "asc";
  const cmp = descending ? "<" : ">";
  const {
    rows,
  } = await db.query(
    `select * from ${schema}"${table.name}" where ${order_field} ${cmp} $1 OR (${order_field}=$2 AND ${pk.name}${cmp} $3) order by ${order_field} ${dir}, ${pk.name} ${dir} limit 1`,
    [current_row[order_field], current_row[order_field], current_row[pk.name]]
  );
  if (rows && rows.length > 0) {
    return (
      (label_field ? fixed_label || "" : "") +
      a(
        {
          href: `/view/${encodeURIComponent(link_view)}?${encodeURIComponent(
            pk.name
          )}=${encodeURIComponent(rows[0][pk.name])}`,
        },
        `${label_field ? text(rows[0][label_field]) : fixed_label || ""}`
      )
    );
  } else return "";
};
module.exports = {
  name: "PreviousOrNextLink",
  display_state_form: false,
  get_state_fields,
  configuration_workflow,
  run,
};
