FROM php:8.3-apache

RUN docker-php-ext-install pdo_mysql \
    && a2enmod rewrite headers \
    && sed -ri 's/AllowOverride None/AllowOverride All/g' /etc/apache2/apache2.conf /etc/apache2/sites-available/000-default.conf \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /var/www/html

COPY . /var/www/html/
COPY docker/entrypoint.sh /usr/local/bin/fragma-entrypoint.sh

RUN sed -i 's/\r$//' /usr/local/bin/fragma-entrypoint.sh \
    && chmod +x /usr/local/bin/fragma-entrypoint.sh \
    && rm -rf /var/www/html/.git /var/www/html/.env /var/www/html/figma-plugin /var/www/html/pemweb /var/www/html/test.py \
    && chown -R www-data:www-data /var/www/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD php -r 'exit(@file_get_contents("http://127.0.0.1/api/health.php") !== false ? 0 : 1);'

ENTRYPOINT ["/usr/local/bin/fragma-entrypoint.sh"]
