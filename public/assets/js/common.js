---
comment: "This file generates a global js values for strings (based on the unified _strings.yml) and other common data. DO NOT TOUCH!"
---

//global js variables
const globals = {
	environment: '{% if site.environment == "development" %}development{% else %}production{% endif %}',
	optional_base_url: '{% if site.environment == "development" %}{{ site.optional_base_url }}{% endif %}',
	cookie_domain: '{{ site.cookie_domain }}'
};

var strings = 
{ {% for lang in site.data._strings %}
	"{{ lang[0] }}": {
		{% for string in lang[1] %} "{{ string[0] }}": "{{ string[1] }}"{% if forloop.last == false %},{% endif %}
		{% endfor %}}{% endfor %}
};